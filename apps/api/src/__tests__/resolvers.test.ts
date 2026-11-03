import { describe, test, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import jwt from "jsonwebtoken";
import { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } from "./setup.js";
import { createTestServer, execute } from "./helpers.js";
import { Shipment } from "../models/Shipment.js";
import { Admin } from "../models/Admin.js";
import { hashPassword } from "../services/authService.js";
import { canTransition, SHIPMENT_STATUSES, type ShipmentStatus } from "../domain/status.js";
import type { ApolloServer } from "@apollo/server";
import type { GraphQLContext } from "../context.js";

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
  test("requires an admin and, once authenticated, creates a shipment in CREATED state", async () => {
    const withoutAuth = await execute(server, {
      query: CREATE_SHIPMENT_MUTATION,
      variables: {
        input: { origin: "Delhi", destination: "Pune", receiverName: "Asha Rao" },
      },
      admin: null,
    });
    expect(withoutAuth.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
    await expect(Shipment.countDocuments()).resolves.toBe(0);

    const admin = await seedAdmin();
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
  test("requires an admin", async () => {
    const result = await execute(server, { query: SHIPMENTS_QUERY, admin: null });
    expect(result.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
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
  test("only allows moving one step forward through the pipeline; DELIVERED is terminal", () => {
    for (const from of SHIPMENT_STATUSES) {
      for (const to of SHIPMENT_STATUSES) {
        const expectedNextIndex = SHIPMENT_STATUSES.indexOf(from as ShipmentStatus) + 1;
        const isTheOneLegalStep = SHIPMENT_STATUSES[expectedNextIndex] === to;
        expect(canTransition(from as ShipmentStatus, to as ShipmentStatus)).toBe(isTheOneLegalStep);
      }
    }
  });
});
