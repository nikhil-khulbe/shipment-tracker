import { describe, test, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } from "./setup.js";
import { createTestServer, execute } from "./helpers.js";
import { Shipment } from "../models/Shipment.js";
import { Admin } from "../models/Admin.js";
import { hashPassword } from "../services/authService.js";
import { config } from "../config.js";
import * as shipmentService from "../services/shipmentService.js";
import type { ApolloServer } from "@apollo/server";
import type { GraphQLContext } from "../context.js";

let server: ApolloServer<GraphQLContext>;

beforeAll(async () => {
  await connectTestDatabase();
  server = createTestServer();
}, 60000);

afterAll(async () => {
  config.requireAdmin = false;
  await disconnectTestDatabase();
});

beforeEach(async () => {
  config.requireAdmin = true; // these tests are about the locked mode
  await clearTestDatabase();
});

async function makeStaff(role: "ADMIN" | "DRIVER", email = `${role.toLowerCase()}@example.com`) {
  const admin = await Admin.create({ email, passwordHash: await hashPassword("pw"), role });
  return { id: admin._id.toString(), email: admin.email };
}

const past = (hours: number) => new Date(Date.now() - hours * 3600_000);

async function makeShipment(overrides: Record<string, unknown> = {}) {
  return Shipment.create({
    trackingId: "SHP-STAFF001",
    origin: "Delhi",
    destination: "Mumbai",
    receiverName: "Asha Rao",
    deliveryOtp: "4821",
    currentStatus: "OUT_FOR_DELIVERY",
    history: [
      { status: "CREATED", location: "Delhi" },
      { status: "PICKED_UP", location: "Delhi" },
      { status: "IN_TRANSIT", location: "Nagpur" },
      { status: "OUT_FOR_DELIVERY", location: "Mumbai" },
    ],
    ...overrides,
  });
}

const code = (r: any) => r.errors?.[0]?.extensions?.code;

const MOVE = `mutation M($input: UpdateStatusInput!) {
  updateStatus(input: $input) { currentStatus deliveredTo deliveryOtp history { status updatedBy } }
}`;
const READ = `query R($id: String!) {
  shipment(trackingId: $id) { deliveredTo deliveryOtp createdBy edits { by } history { updatedBy } }
}`;

describe("roles", () => {
  test("a DRIVER can list and update statuses, but not create, edit, import or see the dashboard", async () => {
    const driver = await makeStaff("DRIVER");
    await makeShipment({ currentStatus: "PICKED_UP", history: [{ status: "CREATED", location: "Delhi" }, { status: "PICKED_UP", location: "Delhi" }] });

    const list: any = await execute(server, { query: `{ shipments { items { trackingId } } }`, admin: driver });
    expect(list.errors).toBeUndefined();

    const move: any = await execute(server, {
      query: MOVE,
      variables: { input: { trackingId: "SHP-STAFF001", status: "IN_TRANSIT", location: "Nagpur" } },
      admin: driver,
    });
    expect(move.errors).toBeUndefined();

    const forbidden = [
      `mutation { createShipment(input: { origin: "A1", destination: "B1", receiverName: "Cc Dd" }) { id } }`,
      `mutation { editShipment(trackingId: "SHP-STAFF001", input: { description: "x" }) { id } }`,
      `mutation { importShipments(inputs: [{ origin: "A1", destination: "B1", receiverName: "Cc Dd" }]) { row } }`,
      `{ dashboardStats { total } }`,
    ];
    for (const query of forbidden) {
      const result = await execute(server, { query, admin: driver });
      expect(code(result)).toBe("FORBIDDEN");
    }
    await expect(Shipment.countDocuments()).resolves.toBe(1);
  });

  test("the delivery code is visible to an ADMIN but never to a DRIVER or the public", async () => {
    const admin = await makeStaff("ADMIN");
    const driver = await makeStaff("DRIVER");
    await makeShipment();

    const asAdmin: any = await execute(server, { query: READ, variables: { id: "SHP-STAFF001" }, admin });
    expect(asAdmin.data.shipment.deliveryOtp).toBe("4821");
    const asDriver: any = await execute(server, { query: READ, variables: { id: "SHP-STAFF001" }, admin: driver });
    expect(asDriver.data.shipment.deliveryOtp).toBeNull();
    const asPublic: any = await execute(server, { query: READ, variables: { id: "SHP-STAFF001" }, admin: null });
    expect(asPublic.data.shipment.deliveryOtp).toBeNull();
  });

  test("a deleted account loses access immediately, even with a still-valid token", async () => {
    const admin = await makeStaff("ADMIN");
    await Admin.deleteMany({});
    const result = await execute(server, { query: `{ dashboardStats { total } }`, admin });
    expect(code(result)).toBe("FORBIDDEN");
  });
});

describe("audit trail", () => {
  test("records who created a shipment and who made each status change, for staff eyes only", async () => {
    const admin = await makeStaff("ADMIN", "boss@example.com");
    const driver = await makeStaff("DRIVER", "rider@example.com");

    const created: any = await execute(server, {
      query: `mutation { createShipment(input: { origin: "Delhi", destination: "Pune", receiverName: "Asha Rao" }) { trackingId createdBy deliveryOtp } }`,
      admin,
    });
    expect(created.errors).toBeUndefined();
    expect(created.data.createShipment.createdBy).toBe("boss@example.com");
    expect(created.data.createShipment.deliveryOtp).toMatch(/^\d{4}$/);
    const id = created.data.createShipment.trackingId;

    await execute(server, { query: MOVE, variables: { input: { trackingId: id, status: "PICKED_UP", location: "Delhi" } }, admin: driver });

    const asAdmin: any = await execute(server, { query: READ, variables: { id }, admin });
    expect(asAdmin.data.shipment.history.map((e: any) => e.updatedBy)).toEqual(["boss@example.com", "rider@example.com"]);

    const asPublic: any = await execute(server, { query: READ, variables: { id }, admin: null });
    expect(asPublic.data.shipment.history.map((e: any) => e.updatedBy)).toEqual([null, null]);
    expect(asPublic.data.shipment.createdBy).toBeNull();
  });
});

describe("proof of delivery", () => {
  const deliver = (admin: any, extra: Record<string, unknown> = {}) =>
    execute(server, {
      query: MOVE,
      variables: { input: { trackingId: "SHP-STAFF001", status: "DELIVERED", location: "Mumbai", ...extra } },
      admin,
    }) as Promise<any>;

  test("needs the recipient's name and the right code; a wrong attempt changes nothing", async () => {
    const driver = await makeStaff("DRIVER");
    await makeShipment();

    expect(code(await deliver(driver))).toBe("BAD_USER_INPUT"); // no name
    expect(code(await deliver(driver, { deliveredTo: "Asha Rao" }))).toBe("BAD_USER_INPUT"); // no code
    expect(code(await deliver(driver, { deliveredTo: "Asha Rao", otp: "0000" }))).toBe("BAD_USER_INPUT"); // wrong code
    expect((await Shipment.findOne({ trackingId: "SHP-STAFF001" }))?.currentStatus).toBe("OUT_FOR_DELIVERY");

    const ok = await deliver(driver, { deliveredTo: "Asha Rao", otp: "4821" });
    expect(ok.errors).toBeUndefined();
    expect(ok.data.updateStatus.currentStatus).toBe("DELIVERED");

    const publicView: any = await execute(server, { query: READ, variables: { id: "SHP-STAFF001" }, admin: null });
    expect(publicView.data.shipment.deliveredTo).toBe("Asha Rao");
  });

  test("older shipments with no code can still be delivered, but the name is always required", async () => {
    const driver = await makeStaff("DRIVER");
    await makeShipment({ deliveryOtp: undefined });
    expect(code(await deliver(driver))).toBe("BAD_USER_INPUT");
    expect((await deliver(driver, { deliveredTo: "Neighbour" })).errors).toBeUndefined();
  });

  test("in open demo mode the name is still required but the code is not", async () => {
    config.requireAdmin = false;
    await makeShipment();
    expect(code(await deliver(null))).toBe("BAD_USER_INPUT");
    expect((await deliver(null, { deliveredTo: "Asha Rao" })).errors).toBeUndefined();
  });
});

describe("editShipment", () => {
  const EDIT = `mutation E($id: String!, $input: EditShipmentInput!) {
    editShipment(trackingId: $id, input: $input) {
      receiverName description senderName weightKg edits { by changes { field from to } }
    }
  }`;
  const edit = (admin: any, input: Record<string, unknown>) =>
    execute(server, { query: EDIT, variables: { id: "SHP-STAFF001", input }, admin }) as Promise<any>;

  test("changes only what is sent, logs each change with who made it, and can clear optional fields", async () => {
    const admin = await makeStaff("ADMIN", "boss@example.com");
    await makeShipment({ description: "Old note", senderName: "Ravi" });

    const result = await edit(admin, { receiverName: "Asha R. Rao", description: "", weightKg: 3 });
    expect(result.errors).toBeUndefined();
    const s = result.data.editShipment;
    expect(s.receiverName).toBe("Asha R. Rao");
    expect(s.description).toBeNull(); // cleared
    expect(s.senderName).toBe("Ravi"); // untouched
    expect(s.weightKg).toBe(3);
    expect(s.edits).toHaveLength(1);
    expect(s.edits[0].by).toBe("boss@example.com");
    expect(s.edits[0].changes).toEqual(
      expect.arrayContaining([
        { field: "receiverName", from: "Asha Rao", to: "Asha R. Rao" },
        { field: "description", from: "Old note", to: null },
        { field: "weightKg", from: null, to: "3" },
      ]),
    );
  });

  test("an edit that changes nothing is not logged; bad input is rejected", async () => {
    const admin = await makeStaff("ADMIN");
    await makeShipment();
    const noop = await edit(admin, { receiverName: "Asha Rao" });
    expect(noop.data.editShipment.edits).toEqual([]);

    expect(code(await edit(admin, { receiverName: "  " }))).toBe("BAD_USER_INPUT"); // required field
    expect(code(await edit(admin, { estimatedDelivery: "2020-01-01" }))).toBe("BAD_USER_INPUT");
    expect(code(await edit(admin, { receiverPhone: "abc" }))).toBe("BAD_USER_INPUT");
    expect((await Shipment.findOne({ trackingId: "SHP-STAFF001" }))?.edits).toHaveLength(0);
  });

  test("a finished shipment can't be edited, and an unknown one is NOT_FOUND", async () => {
    const admin = await makeStaff("ADMIN");
    await makeShipment({
      currentStatus: "DELIVERED",
      history: [{ status: "CREATED", location: "Delhi" }, { status: "DELIVERED", location: "Mumbai" }],
    });
    expect(code(await edit(admin, { description: "late fix" }))).toBe("BAD_USER_INPUT");
    const missing: any = await execute(server, { query: EDIT, variables: { id: "SHP-NOPE", input: { description: "x" } }, admin });
    expect(code(missing)).toBe("NOT_FOUND");
  });
});

describe("dashboardStats", () => {
  test("counts by status, zero-fills 7 days, and finds overdue and stuck shipments", async () => {
    const admin = await makeStaff("ADMIN");
    const base = { origin: "Delhi", destination: "Pune", receiverName: "Asha Rao", history: [{ status: "CREATED", location: "Delhi" }] };
    await Shipment.create({ ...base, trackingId: "SHP-DASH0001", currentStatus: "CREATED" });
    await Shipment.create({
      ...base,
      trackingId: "SHP-DASH0002",
      currentStatus: "IN_TRANSIT",
      estimatedDelivery: past(30), // overdue
    });
    await Shipment.create({ ...base, trackingId: "SHP-DASH0003", currentStatus: "DELIVERED", estimatedDelivery: past(30) });
    // Make #2 look untouched for 5 days (timestamps are managed by Mongoose, so write it directly).
    await Shipment.collection.updateOne({ trackingId: "SHP-DASH0002" }, { $set: { updatedAt: past(24 * 5) } });

    const result: any = await execute(server, {
      query: `{ dashboardStats(stuckAfterHours: 72) {
        total overdueCount byStatus { status count } createdPerDay { date count } stuck { trackingId }
      } }`,
      admin,
    });
    expect(result.errors).toBeUndefined();
    const stats = result.data.dashboardStats;
    expect(stats.total).toBe(3);
    expect(stats.overdueCount).toBe(1); // the delivered one doesn't count
    const count = (status: string) => stats.byStatus.find((r: any) => r.status === status).count;
    expect(count("CREATED")).toBe(1);
    expect(count("IN_TRANSIT")).toBe(1);
    expect(count("DELIVERED")).toBe(1);
    expect(count("RETURNED")).toBe(0);
    expect(stats.createdPerDay).toHaveLength(7);
    expect(stats.createdPerDay.reduce((sum: number, d: any) => sum + d.count, 0)).toBe(3);
    expect(stats.stuck.map((s: any) => s.trackingId)).toEqual(["SHP-DASH0002"]);
  });
});

describe("bulk operations", () => {
  const BULK = `mutation B($ids: [String!]!, $status: ShipmentStatus!, $note: String) {
    bulkUpdateStatus(trackingIds: $ids, status: $status, location: "Hub", note: $note) { trackingId ok error status }
  }`;

  test("moves the legal ones, reports the rest, and ignores duplicates", async () => {
    const driver = await makeStaff("DRIVER");
    const created = (id: string, status: string) =>
      Shipment.create({
        trackingId: id,
        origin: "Delhi",
        destination: "Pune",
        receiverName: "Asha Rao",
        currentStatus: status,
        history: [{ status: "CREATED", location: "Delhi" }, ...(status === "CREATED" ? [] : [{ status, location: "Delhi" }])],
      });
    await created("SHP-BULK0001", "PICKED_UP");
    await created("SHP-BULK0002", "PICKED_UP");
    await created("SHP-BULK0003", "CREATED"); // can't jump straight to IN_TRANSIT

    const result: any = await execute(server, {
      query: BULK,
      variables: { ids: ["SHP-BULK0001", "shp-bulk0002", "SHP-BULK0003", "SHP-BULK0001", "SHP-NOPE0000"], status: "IN_TRANSIT" },
      admin: driver,
    });
    expect(result.errors).toBeUndefined();
    const rows = result.data.bulkUpdateStatus;
    expect(rows).toHaveLength(4); // the duplicate is collapsed
    const by = (id: string) => rows.find((r: any) => r.trackingId === id);
    expect(by("SHP-BULK0001")).toMatchObject({ ok: true, status: "IN_TRANSIT" });
    expect(by("SHP-BULK0002")).toMatchObject({ ok: true });
    expect(by("SHP-BULK0003").ok).toBe(false);
    expect(by("SHP-NOPE0000").error).toMatch(/No shipment found/);
    expect((await Shipment.findOne({ trackingId: "SHP-BULK0003" }))?.currentStatus).toBe("CREATED");
  });

  test("refuses DELIVERED, an empty list, and more than 50 at once", async () => {
    const driver = await makeStaff("DRIVER");
    const run = (ids: string[], status = "IN_TRANSIT") =>
      execute(server, { query: BULK, variables: { ids, status }, admin: driver }) as Promise<any>;
    expect(code(await run(["SHP-A"], "DELIVERED"))).toBe("BAD_USER_INPUT");
    expect(code(await run([]))).toBe("BAD_USER_INPUT");
    expect(code(await run(Array.from({ length: 51 }, (_, i) => `SHP-X${i}`)))).toBe("BAD_USER_INPUT");
  });
});

describe("importShipments", () => {
  test("creates the good rows and reports the bad ones by row number", async () => {
    const admin = await makeStaff("ADMIN");
    const result: any = await execute(server, {
      query: `mutation($inputs: [CreateShipmentInput!]!) { importShipments(inputs: $inputs) { row ok error trackingId } }`,
      variables: {
        inputs: [
          { origin: "Delhi", destination: "Pune", receiverName: "Asha Rao" },
          { origin: "X", destination: "Pune", receiverName: "Bad Origin" }, // origin too short
          { origin: "Goa", destination: "Chennai", receiverName: "Ravi", packageType: "FRAGILE", weightKg: 1.5 },
        ],
      },
      admin,
    });
    expect(result.errors).toBeUndefined();
    const rows = result.data.importShipments;
    expect(rows.map((r: any) => r.ok)).toEqual([true, false, true]);
    expect(rows[1].error).toBeTruthy();
    expect(rows[0].trackingId).toMatch(/^SHP-/);
    await expect(Shipment.countDocuments()).resolves.toBe(2);
  });

  test("the service caps an import at 200 rows", async () => {
    const tooMany = Array.from({ length: 201 }, () => ({ origin: "Delhi", destination: "Pune", receiverName: "Asha Rao" }));
    await expect(shipmentService.importShipments(tooMany)).rejects.toThrow(/at most 200/);
  });
});
