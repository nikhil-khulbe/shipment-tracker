import { describe, test, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } from "./setup.js";
import { createTestServer, execute } from "./helpers.js";
import { Shipment } from "../models/Shipment.js";
import { Admin } from "../models/Admin.js";
import { hashPassword } from "../services/authService.js";
import { config } from "../config.js";
import { buildAuditCsv, csvCell, auditRowsFor } from "../domain/auditExport.js";
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
  config.requireAdmin = true;
  await clearTestDatabase();
});

async function makeStaff(role: "ADMIN" | "DRIVER") {
  const admin = await Admin.create({ email: `${role.toLowerCase()}@example.com`, passwordHash: await hashPassword("pw"), role });
  return { id: admin._id.toString(), email: admin.email };
}

const EXPORT = `query E($from: String, $to: String) { auditExport(from: $from, to: $to) { csv rows truncated } }`;
const code = (r: any) => r.errors?.[0]?.extensions?.code;

function makeShipment() {
  return Shipment.create({
    trackingId: "SHP-AUD00001",
    origin: "Delhi",
    destination: "Mumbai",
    receiverName: "Asha Rao",
    currentStatus: "DELAYED",
    history: [
      { status: "CREATED", location: "Delhi", timestamp: new Date("2026-01-01T10:00:00Z"), by: "admin@example.com" },
      { status: "PICKED_UP", location: "Delhi", timestamp: new Date("2026-01-02T10:00:00Z") },
      { status: "DELAYED", location: "Nagpur", note: "=HYPERLINK(\"http://evil\")", timestamp: new Date("2026-01-05T10:00:00Z"), by: "driver@example.com" },
    ],
    edits: [{ at: new Date("2026-01-03T10:00:00Z"), by: "admin@example.com", changes: [{ field: "destination", from: "Pune", to: "Mumbai" }] }],
  });
}

describe("csvCell", () => {
  test("quotes commas, quotes and newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  test("defuses spreadsheet formulas", () => {
    for (const evil of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx"]) {
      expect(csvCell(evil).startsWith("'")).toBe(true);
    }
  });
});

describe("auditRowsFor / buildAuditCsv", () => {
  test("status events carry the previous status; edits give one row per field", () => {
    const rows = auditRowsFor({
      trackingId: "SHP-1",
      history: [
        { status: "CREATED", timestamp: new Date("2026-01-01") },
        { status: "PICKED_UP", timestamp: new Date("2026-01-02") },
      ],
      edits: [{ at: new Date("2026-01-03"), by: "a@x.com", changes: [{ field: "origin", from: "A", to: "B" }, { field: "weightKg", to: "2" }] }],
    });
    expect(rows.map((r) => [r.event, r.field, r.from, r.to])).toEqual([
      ["STATUS", "status", "", "CREATED"],
      ["STATUS", "status", "CREATED", "PICKED_UP"],
      ["EDIT", "origin", "A", "B"],
      ["EDIT", "weightKg", "", "2"],
    ]);
  });

  test("sorts oldest first and ends with a newline", () => {
    const csv = buildAuditCsv([
      ...auditRowsFor({ trackingId: "SHP-B", history: [{ status: "CREATED", timestamp: new Date("2026-02-01") }] }),
      ...auditRowsFor({ trackingId: "SHP-A", history: [{ status: "CREATED", timestamp: new Date("2026-01-01") }] }),
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("timestamp,trackingId,event,field,from,to,location,note,by");
    expect(lines[1]).toContain("SHP-A");
    expect(lines[2]).toContain("SHP-B");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("auditExport query", () => {
  test("an ADMIN gets every status event and edit, with formulas defused", async () => {
    const admin = await makeStaff("ADMIN");
    await makeShipment();
    const result: any = await execute(server, { query: EXPORT, admin });
    expect(result.errors).toBeUndefined();
    const { csv, rows, truncated } = result.data.auditExport;
    expect(rows).toBe(4); // 3 status events + 1 edit
    expect(truncated).toBe(false);
    expect(csv).toContain("2026-01-03T10:00:00.000Z,SHP-AUD00001,EDIT,destination,Pune,Mumbai");
    expect(csv).toContain("driver@example.com");
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  test("the date range filters events, and a bare `to` date includes that whole day", async () => {
    const admin = await makeStaff("ADMIN");
    await makeShipment();
    const result: any = await execute(server, { query: EXPORT, variables: { from: "2026-01-02", to: "2026-01-03" }, admin });
    expect(result.errors).toBeUndefined();
    expect(result.data.auditExport.rows).toBe(2); // PICKED_UP (2nd) and the edit (3rd, 10:00 is inside the day)
  });

  test("rejects bad or reversed dates", async () => {
    const admin = await makeStaff("ADMIN");
    const bad: any = await execute(server, { query: EXPORT, variables: { from: "not a date" }, admin });
    expect(code(bad)).toBe("BAD_USER_INPUT");
    const reversed: any = await execute(server, { query: EXPORT, variables: { from: "2026-02-01", to: "2026-01-01" }, admin });
    expect(code(reversed)).toBe("BAD_USER_INPUT");
  });

  test("a DRIVER and anonymous callers are refused", async () => {
    const driver = await makeStaff("DRIVER");
    await makeShipment();
    expect(code(await execute(server, { query: EXPORT, admin: driver }))).toBe("FORBIDDEN");
    const anon: any = await execute(server, { query: EXPORT, admin: null });
    expect(anon.data).toBeNull();
    expect(anon.errors).toBeDefined();
  });

  test("an empty database still yields a header-only file", async () => {
    const admin = await makeStaff("ADMIN");
    const result: any = await execute(server, { query: EXPORT, admin });
    expect(result.data.auditExport.rows).toBe(0);
    expect(result.data.auditExport.csv.trim()).toBe("timestamp,trackingId,event,field,from,to,location,note,by");
  });
});
