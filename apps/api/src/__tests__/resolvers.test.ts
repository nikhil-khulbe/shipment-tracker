import { describe, test, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import jwt from "jsonwebtoken";
import { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } from "./setup.js";
import { createTestServer, execute } from "./helpers.js";
import { Shipment } from "../models/Shipment.js";
import { Admin } from "../models/Admin.js";
import { hashPassword } from "../services/authService.js";
import {
  allowedNext,
  canTransition,
  lastRegularStatus,
  REGULAR_STATUSES,
  SHIPMENT_STATUSES,
} from "../domain/status.js";
import type { ApolloServer } from "@apollo/server";
import type { GraphQLContext } from "../context.js";
import { config } from "../config.js";

let server: ApolloServer<GraphQLContext>;

beforeAll(async () => {
  await connectTestDatabase();
  server = createTestServer();
}, 60000);

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

const SHIPMENT_QUERY = `
  query Shipment($trackingId: String!) {
    shipment(trackingId: $trackingId) {
      trackingId
      currentStatus
      history {
        status
        location
        note
      }
    }
  }
`;

const CREATE_SHIPMENT_MUTATION = `
  mutation CreateShipment($input: CreateShipmentInput!) {
    createShipment(input: $input) {
      trackingId
      currentStatus
      history {
        status
      }
    }
  }
`;

const UPDATE_STATUS_MUTATION = `
  mutation UpdateStatus($input: UpdateStatusInput!) {
    updateStatus(input: $input) {
      trackingId
      currentStatus
      history {
        status
        location
        note
        timestamp
      }
    }
  }
`;

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      email
      expiresIn
    }
  }
`;

async function seedAdmin(email = "admin@example.com", password = "correct-password") {
  const passwordHash = await hashPassword(password);
  const admin = await Admin.create({ email, passwordHash });
  return { id: admin._id.toString(), email: admin.email };
}

async function seedShipment() {
  return Shipment.create({
    trackingId: "SHP-TEST0001",
    origin: "Delhi",
    destination: "Mumbai",
    receiverName: "Test Receiver",
    currentStatus: "PICKED_UP",
    history: [
      { status: "CREATED", location: "Delhi", timestamp: new Date("2026-01-01T00:00:00Z") },
      { status: "PICKED_UP", location: "Delhi Hub", timestamp: new Date("2026-01-02T00:00:00Z") },
    ],
  });
}

describe("Query.shipment", () => {
  test("returns the full history for a known tracking ID, and null for an unknown one", async () => {
    const shipment = await seedShipment();

    const found = await execute(server, {
      query: SHIPMENT_QUERY,
      variables: { trackingId: shipment.trackingId },
    });
    expect(found.errors).toBeUndefined();
    expect(found.data).toEqual({
      shipment: {
        trackingId: "SHP-TEST0001",
        currentStatus: "PICKED_UP",
        history: [
          { status: "CREATED", location: "Delhi", note: null },
          { status: "PICKED_UP", location: "Delhi Hub", note: null },
        ],
      },
    });

    const missing = await execute(server, {
      query: SHIPMENT_QUERY,
      variables: { trackingId: "SHP-NOPE0000" },
    });
    expect(missing.errors).toBeUndefined();
    expect(missing.data).toEqual({ shipment: null });
  });
});

describe("Mutation.createShipment", () => {
  test("is open to anyone and creates a shipment in CREATED state", async () => {
    const admin = null;
    const withAuth = await execute(server, {
      query: CREATE_SHIPMENT_MUTATION,
      variables: {
        input: { origin: "Delhi", destination: "Pune", receiverName: "Asha Rao" },
      },
      admin,
    });

    expect(withAuth.errors).toBeUndefined();
    const created = withAuth.data as any;
    expect(created.createShipment.trackingId).toMatch(/^SHP-[A-Z0-9]{8}$/);
    expect(created.createShipment.currentStatus).toBe("CREATED");
    expect(created.createShipment.history).toHaveLength(1);
    expect(created.createShipment.history[0].status).toBe("CREATED");
  });
});

describe("Mutation.updateStatus", () => {
  test("advances a legal transition and appends a new history event", async () => {
    const admin = await seedAdmin();
    const shipment = await seedShipment(); // currentStatus: PICKED_UP

    const result = await execute(server, {
      query: UPDATE_STATUS_MUTATION,
      variables: {
        input: {
          trackingId: shipment.trackingId,
          status: "IN_TRANSIT",
          location: "Mumbai Hub",
          note: "Left the sorting facility",
        },
      },
      admin,
    });

    expect(result.errors).toBeUndefined();
    const updated = (result.data as any).updateStatus;
    expect(updated.currentStatus).toBe("IN_TRANSIT");
    expect(updated.history).toHaveLength(3);

    const newEvent = updated.history[2];
    expect(newEvent.status).toBe("IN_TRANSIT");
    expect(newEvent.location).toBe("Mumbai Hub");
    expect(newEvent.note).toBe("Left the sorting facility");
    const previousTimestamp = new Date(updated.history[1].timestamp).getTime();
    expect(new Date(newEvent.timestamp).getTime()).toBeGreaterThanOrEqual(previousTimestamp);
  });

  test("rejects an illegal transition and leaves the shipment unchanged", async () => {
    const admin = await seedAdmin();
    const shipment = await seedShipment(); // currentStatus: PICKED_UP

    const result = await execute(server, {
      query: UPDATE_STATUS_MUTATION,
      variables: {
        input: {
          trackingId: shipment.trackingId,
          status: "DELIVERED",
          location: "Mumbai",
        },
      },
      admin,
    });

    expect(result.errors?.[0]?.extensions?.code).toBe("INVALID_STATUS_TRANSITION");

    const reloaded = await Shipment.findOne({ trackingId: shipment.trackingId });
    expect(reloaded?.currentStatus).toBe("PICKED_UP");
    expect(reloaded?.history).toHaveLength(2);
  });
});

describe("Mutation.login", () => {
  test("succeeds with the right password and fails identically for a wrong password or unknown email", async () => {
    await seedAdmin("admin@example.com", "correct-password");

    const success = await execute(server, {
      query: LOGIN_MUTATION,
      variables: { email: "admin@example.com", password: "correct-password" },
    });
    expect(success.errors).toBeUndefined();
    const payload = (success.data as any).login;
    expect(typeof payload.token).toBe("string");
    expect(payload.email).toBe("admin@example.com");

    const decoded = jwt.verify(payload.token, process.env.JWT_SECRET as string) as { sub: string };
    const admin = await Admin.findOne({ email: "admin@example.com" });
    expect(decoded.sub).toBe(admin?._id.toString());

    const wrongPassword = await execute(server, {
      query: LOGIN_MUTATION,
      variables: { email: "admin@example.com", password: "wrong-password" },
    });
    const unknownEmail = await execute(server, {
      query: LOGIN_MUTATION,
      variables: { email: "nobody@example.com", password: "correct-password" },
    });

    expect(wrongPassword.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
    expect(unknownEmail.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
    expect(wrongPassword.errors?.[0]?.message).toBe(unknownEmail.errors?.[0]?.message);
  });
});

const SHIPMENTS_QUERY = `
  query Shipments($status: ShipmentStatus, $search: String, $cursor: String, $limit: Int) {
    shipments(status: $status, search: $search, cursor: $cursor, limit: $limit) {
      items {
        trackingId
        currentStatus
      }
      nextCursor
    }
  }
`;

describe("Query.shipments (admin list)", () => {
  test("is open to anyone", async () => {
    const result = await execute(server, { query: SHIPMENTS_QUERY, admin: null });
    expect(result.errors).toBeUndefined();
  });

  test("pages through every shipment exactly once, newest first, and honours the status filter and search", async () => {
    const admin = await seedAdmin();

    // 7 shipments. Several deliberately share a createdAt millisecond so the
    // (createdAt, _id) tie-break is exercised — a createdAt-only cursor would
    // skip or repeat rows at those boundaries.
    const sameInstant = new Date("2026-03-01T00:00:00Z");
    for (let i = 1; i <= 7; i++) {
      await Shipment.create({
        trackingId: `SHP-PAGE000${i}`,
        origin: "Delhi",
        destination: "Mumbai",
        receiverName: "Test Receiver",
        currentStatus: i % 2 === 1 ? "IN_TRANSIT" : "CREATED",
        history: [{ status: "CREATED", location: "Delhi", timestamp: sameInstant }],
        createdAt: i <= 3 ? new Date("2026-02-01T00:00:00Z") : sameInstant,
      });
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: any = await execute(server, { query: SHIPMENTS_QUERY, variables: { limit: 3, cursor }, admin });
      expect(page.errors).toBeUndefined();
      const { items, nextCursor } = page.data.shipments;
      expect(items.length).toBeLessThanOrEqual(3);
      seen.push(...items.map((item: any) => item.trackingId));
      cursor = nextCursor;
      pages++;
    } while (cursor && pages < 10);

    expect(pages).toBe(3); // 3 + 3 + 1
    expect(new Set(seen).size).toBe(7); // no duplicates
    expect(seen).toHaveLength(7); // none missing
    // Newest createdAt first: the four "sameInstant" rows (4..7) precede 1..3.
    expect(seen.slice(0, 4).sort()).toEqual(["SHP-PAGE0004", "SHP-PAGE0005", "SHP-PAGE0006", "SHP-PAGE0007"]);

    const filtered: any = await execute(server, {
      query: SHIPMENTS_QUERY,
      variables: { status: "IN_TRANSIT", limit: 50 },
      admin,
    });
    const filteredIds = filtered.data.shipments.items.map((item: any) => item.trackingId).sort();
    expect(filteredIds).toEqual(["SHP-PAGE0001", "SHP-PAGE0003", "SHP-PAGE0005", "SHP-PAGE0007"]);
    expect(filtered.data.shipments.nextCursor).toBeNull();

    const searched: any = await execute(server, {
      query: SHIPMENTS_QUERY,
      variables: { search: "shp-page0003" }, // case-insensitive prefix
      admin,
    });
    expect(searched.data.shipments.items.map((item: any) => item.trackingId)).toEqual(["SHP-PAGE0003"]);

    const badCursor = await execute(server, { query: SHIPMENTS_QUERY, variables: { cursor: "garbage" }, admin });
    expect(badCursor.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
  });
});

describe("canTransition (pure unit test, no DB)", () => {
  test("between main-path statuses, only the next step is legal; DELIVERED is terminal", () => {
    for (const from of REGULAR_STATUSES) {
      for (const to of REGULAR_STATUSES) {
        const isTheOneLegalStep = REGULAR_STATUSES[REGULAR_STATUSES.indexOf(from) + 1] === to;
        expect(canTransition(from, to)).toBe(isTheOneLegalStep);
      }
    }
  });

  test("terminal statuses have no way out; no status can move to itself", () => {
    for (const terminal of ["DELIVERED", "RETURNED", "CANCELLED"] as const) {
      for (const lastRegular of REGULAR_STATUSES) {
        expect(allowedNext(terminal, lastRegular)).toEqual([]);
      }
    }
    for (const status of SHIPMENT_STATUSES) {
      for (const lastRegular of REGULAR_STATUSES) {
        expect(allowedNext(status, lastRegular)).not.toContain(status);
      }
    }
  });

  test("a delayed or held shipment resumes where it left off, and exceptions are only reachable from sensible places", () => {
    expect(allowedNext("DELAYED", "IN_TRANSIT")).toEqual(
      expect.arrayContaining(["IN_TRANSIT", "OUT_FOR_DELIVERY", "ON_HOLD", "RETURNED"]),
    );
    expect(allowedNext("DELAYED", "IN_TRANSIT")).not.toContain("PICKED_UP");
    // A parcel still at the origin can be cancelled but not "returned"; one on the road is the opposite.
    expect(allowedNext("ON_HOLD", "CREATED")).toContain("CANCELLED");
    expect(allowedNext("ON_HOLD", "CREATED")).not.toContain("RETURNED");
    expect(allowedNext("ON_HOLD", "IN_TRANSIT")).toContain("RETURNED");
    expect(allowedNext("ON_HOLD", "IN_TRANSIT")).not.toContain("CANCELLED");
    // A failed delivery attempt only happens on the last mile, and only retry / hold / return follow it.
    expect(allowedNext("IN_TRANSIT", "IN_TRANSIT")).not.toContain("DELIVERY_ATTEMPT_FAILED");
    expect(allowedNext("OUT_FOR_DELIVERY", "OUT_FOR_DELIVERY")).toContain("DELIVERY_ATTEMPT_FAILED");
    expect(allowedNext("DELIVERY_ATTEMPT_FAILED", "OUT_FOR_DELIVERY").sort()).toEqual(
      ["ON_HOLD", "OUT_FOR_DELIVERY", "RETURNED"].sort(),
    );
  });

  test("lastRegularStatus ignores exception events", () => {
    expect(lastRegularStatus([{ status: "CREATED" }, { status: "PICKED_UP" }, { status: "DELAYED" }])).toBe("PICKED_UP");
    expect(lastRegularStatus([])).toBe("CREATED");
  });
});

describe("exception statuses through the API", () => {
  const MOVE = `
    mutation Move($input: UpdateStatusInput!) {
      updateStatus(input: $input) { currentStatus allowedNextStatuses history { status location note } }
    }
  `;
  const move = (status: string, note?: string) =>
    execute(server, {
      query: MOVE,
      variables: { input: { trackingId: "SHP-TEST0001", status, location: "Nagpur Hub", note } },
    }) as Promise<any>;

  test("a delay needs a reason, then the shipment resumes its journey and is delivered", async () => {
    await seedShipment(); // PICKED_UP

    const noReason = await move("DELAYED");
    expect(noReason.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    expect((await Shipment.findOne({ trackingId: "SHP-TEST0001" }))?.currentStatus).toBe("PICKED_UP");

    const delayed = await move("DELAYED", "Heavy rain on the highway");
    expect(delayed.errors).toBeUndefined();
    expect(delayed.data.updateStatus.currentStatus).toBe("DELAYED");
    expect(delayed.data.updateStatus.allowedNextStatuses).toEqual(
      expect.arrayContaining(["PICKED_UP", "IN_TRANSIT", "ON_HOLD", "RETURNED"]),
    );

    // It was only picked up, so it can't skip ahead to the last mile.
    const skip = await move("OUT_FOR_DELIVERY");
    expect(skip.errors?.[0]?.extensions?.code).toBe("INVALID_STATUS_TRANSITION");

    const resumed = await move("IN_TRANSIT");
    expect(resumed.errors).toBeUndefined();
    expect(resumed.data.updateStatus.history.map((e: any) => e.status)).toEqual([
      "CREATED",
      "PICKED_UP",
      "DELAYED",
      "IN_TRANSIT",
    ]);
  });

  test("a failed delivery can be retried or returned; RETURNED is final", async () => {
    await Shipment.create({
      trackingId: "SHP-TEST0001",
      origin: "Delhi",
      destination: "Mumbai",
      receiverName: "Test Receiver",
      currentStatus: "OUT_FOR_DELIVERY",
      history: [
        { status: "CREATED", location: "Delhi" },
        { status: "PICKED_UP", location: "Delhi" },
        { status: "IN_TRANSIT", location: "Nagpur" },
        { status: "OUT_FOR_DELIVERY", location: "Mumbai" },
      ],
    });
    const failed = await move("DELIVERY_ATTEMPT_FAILED", "Receiver not home");
    expect(failed.data.updateStatus.currentStatus).toBe("DELIVERY_ATTEMPT_FAILED");

    const retry = await move("OUT_FOR_DELIVERY");
    expect(retry.data.updateStatus.currentStatus).toBe("OUT_FOR_DELIVERY");

    await move("DELIVERY_ATTEMPT_FAILED", "Receiver not home again");
    const returned = await move("RETURNED", "Two failed attempts");
    expect(returned.data.updateStatus.currentStatus).toBe("RETURNED");
    expect(returned.data.updateStatus.allowedNextStatuses).toEqual([]);

    const afterReturn = await move("OUT_FOR_DELIVERY");
    expect(afterReturn.errors?.[0]?.extensions?.code).toBe("INVALID_STATUS_TRANSITION");
  });

  test("a shipment can be cancelled before it leaves, with a reason", async () => {
    await Shipment.create({
      trackingId: "SHP-TEST0001",
      origin: "Delhi",
      destination: "Mumbai",
      receiverName: "Test Receiver",
      currentStatus: "CREATED",
      history: [{ status: "CREATED", location: "Delhi" }],
    });
    expect((await move("CANCELLED")).errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    const cancelled = await move("CANCELLED", "Sender changed their mind");
    expect(cancelled.data.updateStatus.currentStatus).toBe("CANCELLED");
  });
});

describe("locked mode (REQUIRE_ADMIN=true)", () => {
  beforeAll(() => {
    config.requireAdmin = true;
  });
  afterAll(() => {
    config.requireAdmin = false;
  });

  test("authRequired reports true, and is readable without logging in", async () => {
    const result = await execute(server, { query: "{ authRequired }", admin: null });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ authRequired: true });
  });

  test("list, create and update all reject anonymous callers and change nothing", async () => {
    await seedShipment();

    const list = await execute(server, { query: SHIPMENTS_QUERY, admin: null });
    expect(list.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");

    const create = await execute(server, {
      query: CREATE_SHIPMENT_MUTATION,
      variables: { input: { origin: "Delhi", destination: "Pune", receiverName: "Asha Rao" } },
      admin: null,
    });
    expect(create.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
    await expect(Shipment.countDocuments()).resolves.toBe(1);

    const update = await execute(server, {
      query: UPDATE_STATUS_MUTATION,
      variables: { input: { trackingId: "SHP-TEST0001", status: "IN_TRANSIT", location: "Nagpur" } },
      admin: null,
    });
    expect(update.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
    const unchanged = await Shipment.findOne({ trackingId: "SHP-TEST0001" });
    expect(unchanged?.currentStatus).toBe("PICKED_UP");
  });

  test("the public tracking lookup stays open", async () => {
    await seedShipment();
    const result = await execute(server, { query: SHIPMENT_QUERY, variables: { trackingId: "SHP-TEST0001" }, admin: null });
    expect(result.errors).toBeUndefined();
    expect((result.data as any).shipment.trackingId).toBe("SHP-TEST0001");
  });

  test("a logged-in admin can still do everything", async () => {
    const admin = await seedAdmin();
    const created = await execute(server, {
      query: CREATE_SHIPMENT_MUTATION,
      variables: { input: { origin: "Delhi", destination: "Pune", receiverName: "Asha Rao" } },
      admin,
    });
    expect(created.errors).toBeUndefined();
  });
});

describe("query depth limit", () => {
  test("rejects absurdly nested selections", async () => {
    // Build a 12-deep selection using inline fragments is cheap; use nested fields on a valid path.
    const deep = "{ shipment(trackingId: \"X\") { history { status } } }";
    const ok = await execute(server, { query: deep });
    expect(ok.errors).toBeUndefined();

    // Depth counting is exercised directly against the rule, since the schema has no recursive type.
    const { parse, validate, buildSchema } = await import("graphql");
    const { depthLimit } = await import("../depthLimit.js");
    const schema = buildSchema("type Query { a: A } type A { a: A, b: Int }");
    const nest = (n: number): string => (n === 0 ? "b" : `a { ${nest(n - 1)} }`);
    expect(validate(schema, parse(`{ ${nest(7)} }`), [depthLimit(8)])).toHaveLength(0);
    expect(validate(schema, parse(`{ ${nest(8)} }`), [depthLimit(8)])).toHaveLength(1);
  });
});

describe("shipment details and estimated delivery", () => {
  const DETAILS_MUTATION = `
    mutation Create($input: CreateShipmentInput!) {
      createShipment(input: $input) {
        trackingId senderName receiverPhone packageType weightKg description estimatedDelivery
      }
    }
  `;
  const DETAILS_QUERY = `
    query S($trackingId: String!) {
      shipment(trackingId: $trackingId) { receiverPhone senderName packageType weightKg estimatedDelivery }
    }
  `;
  const base = { origin: "Delhi", destination: "Pune", receiverName: "Asha Rao" };
  const inThreeDays = () => new Date(Date.now() + 3 * 86400000).toISOString();

  test("stores the details, and masks the phone number from anonymous viewers", async () => {
    const admin = await seedAdmin();
    const eta = inThreeDays();
    const created: any = await execute(server, {
      query: DETAILS_MUTATION,
      variables: {
        input: {
          ...base,
          senderName: "Ravi Kumar",
          receiverPhone: "+91 98765 43210",
          packageType: "FRAGILE",
          weightKg: 2.5,
          description: "Glassware",
          estimatedDelivery: eta,
        },
      },
      admin,
    });
    expect(created.errors).toBeUndefined();
    const { trackingId } = created.data.createShipment;
    // The admin who just created it sees the full number...
    expect(created.data.createShipment.receiverPhone).toBe("+91 98765 43210");
    expect(created.data.createShipment.estimatedDelivery).toBe(eta);

    // ...but anyone with just the tracking ID sees only the last 4 digits.
    const anon: any = await execute(server, { query: DETAILS_QUERY, variables: { trackingId }, admin: null });
    expect(anon.errors).toBeUndefined();
    expect(anon.data.shipment).toEqual({
      receiverPhone: "•".repeat(6) + "3210",
      senderName: "Ravi Kumar",
      packageType: "FRAGILE",
      weightKg: 2.5,
      estimatedDelivery: eta,
    });
  });

  test("rejects an invalid or past estimated delivery, a bad phone, and a bad weight; nothing is stored", async () => {
    const bad = [
      { estimatedDelivery: "not-a-date" },
      { estimatedDelivery: "2020-01-01" },
      { receiverPhone: "abc" },
      { weightKg: -3 },
    ];
    for (const extra of bad) {
      const result = await execute(server, { query: DETAILS_MUTATION, variables: { input: { ...base, ...extra } } });
      expect(result.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    }
    await expect(Shipment.countDocuments()).resolves.toBe(0);
  });

  test("shipments created before these fields existed still load, with nulls", async () => {
    await seedShipment(); // has none of the new fields
    const result: any = await execute(server, { query: DETAILS_QUERY, variables: { trackingId: "SHP-TEST0001" } });
    expect(result.errors).toBeUndefined();
    expect(result.data.shipment).toEqual({
      receiverPhone: null,
      senderName: null,
      packageType: null,
      weightKg: null,
      estimatedDelivery: null,
    });
  });
});
