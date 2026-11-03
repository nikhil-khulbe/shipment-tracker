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
