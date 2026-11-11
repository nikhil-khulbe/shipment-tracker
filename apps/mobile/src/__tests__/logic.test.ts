import { describeEta, etaInDays } from "../eta";
import { parseShipmentsCsv, splitCsv } from "../csv";
import { darkRuns, makeQr } from "../qr";
import { extractTrackingId } from "../scan";
import { MAX_SAVED, toggleSaved } from "../savedShipments";
import { shipmentProgress } from "../theme/status";
import { commonNextStatuses } from "../components/ShipmentList";
import { sinceLabel } from "../components/admin/DashboardPanel";
import { auditFileName } from "../exportAudit";
import type { StatusEvent } from "../types";

const event = (status: StatusEvent["status"], note: string | null = null, timestamp = "2026-11-06T10:00:00.000Z"): StatusEvent => ({
  status,
  location: "Somewhere",
  note,
  timestamp,
});

describe("describeEta", () => {
  const now = new Date(2026, 10, 6, 15, 0, 0); // 6 Nov 2026, 3pm local
  const base = { history: [event("CREATED")] };

  test("speaks in calendar days, not hours", () => {
    const at = (days: number) => new Date(2026, 10, 6 + days, 9, 0, 0).toISOString();
    expect(describeEta({ ...base, currentStatus: "IN_TRANSIT", estimatedDelivery: at(0) }, now)?.text).toBe("Arriving today");
    expect(describeEta({ ...base, currentStatus: "IN_TRANSIT", estimatedDelivery: at(1) }, now)?.text).toBe("Arriving tomorrow");
    expect(describeEta({ ...base, currentStatus: "IN_TRANSIT", estimatedDelivery: at(4) }, now)?.text).toMatch(/^Arriving by /);
  });

  test("flags a missed date as overdue", () => {
    const late = describeEta({ ...base, currentStatus: "IN_TRANSIT", estimatedDelivery: new Date(2026, 10, 3, 12).toISOString() }, now);
    expect(late?.overdue).toBe(true);
    expect(late?.text).toMatch(/running late/);
  });

  test("has nothing to say without an estimate", () => {
    expect(describeEta({ ...base, currentStatus: "IN_TRANSIT", estimatedDelivery: null }, now)).toBeNull();
  });

  test("exception statuses show the admin's reason and are marked as problems", () => {
    const history = [event("CREATED"), event("DELAYED", "Heavy rain")];
    expect(describeEta({ history, currentStatus: "DELAYED", estimatedDelivery: null }, now)).toEqual({ text: "Delayed: Heavy rain", overdue: true });
    expect(describeEta({ history: [event("RETURNED")], currentStatus: "RETURNED" }, now)?.text).toBe("Returned to sender");
    expect(describeEta({ history: [event("CANCELLED", "Sender cancelled")], currentStatus: "CANCELLED" }, now)?.text).toBe("Cancelled: Sender cancelled");
  });

  test("a delivered shipment reports the delivery day, not the estimate", () => {
    const eta = describeEta({ history: [event("CREATED"), event("DELIVERED")], currentStatus: "DELIVERED", estimatedDelivery: "2026-12-30T00:00:00.000Z" }, now);
    expect(eta?.text).toMatch(/^Delivered on /);
    expect(eta?.overdue).toBe(false);
  });

  test("etaInDays is a future local-noon timestamp", () => {
    const iso = etaInDays(3, now);
    const d = new Date(iso);
    expect(d.getDate()).toBe(9);
    expect(d.getHours()).toBe(12);
  });
});

describe("shipmentProgress", () => {
  test("follows the main path", () => {
    expect(shipmentProgress({ currentStatus: "CREATED", history: [] })).toBe(0);
    expect(shipmentProgress({ currentStatus: "IN_TRANSIT", history: [] })).toBe(0.5);
    expect(shipmentProgress({ currentStatus: "DELIVERED", history: [] })).toBe(1);
  });

  test("a delayed parcel keeps the progress of the last main-path step it reached", () => {
    const history = [event("CREATED"), event("PICKED_UP"), event("IN_TRANSIT"), event("DELAYED", "rain")];
    expect(shipmentProgress({ currentStatus: "DELAYED", history })).toBe(0.5);
    expect(shipmentProgress({ currentStatus: "ON_HOLD", history: [event("CREATED"), event("ON_HOLD", "x")] })).toBe(0);
  });

  test("returned and cancelled shipments show an empty bar", () => {
    const history = [event("CREATED"), event("PICKED_UP"), event("RETURNED", "x")];
    expect(shipmentProgress({ currentStatus: "RETURNED", history })).toBe(0);
    expect(shipmentProgress({ currentStatus: "CANCELLED", history })).toBe(0);
  });
});

describe("CSV import parsing", () => {
  test("splitCsv handles quotes, escaped quotes, commas inside quotes, CRLF and blank lines", () => {
    const records = splitCsv('a,b,c\r\n"x, y","say ""hi""",z\r\n\r\nlast,,\r\n');
    expect(records.map((r) => r.fields)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "z"],
      ["last", "", ""],
    ]);
  });

  test("accepts a header in any order, with aliases, and builds typed rows", () => {
    const csv = "To,From,Receiver,weight,type,ETA\nPune,Delhi,Asha Rao,2.5,fragile,2026-12-01";
    const parsed = parseShipmentsCsv(csv);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        origin: "Delhi",
        destination: "Pune",
        receiverName: "Asha Rao",
        weightKg: 2.5,
        packageType: "FRAGILE",
        estimatedDelivery: "2026-12-01T12:00:00.000Z",
      },
    ]);
  });

  test("keeps the good rows and reports each bad one with its line number", () => {
    const csv = [
      "origin,destination,receiverName,packageType,weightKg,estimatedDelivery",
      "Delhi,Pune,Asha Rao,,,", // ok (line 2)
      "Delhi,,Bob,,,", // missing destination (line 3)
      "Delhi,Pune,Cy,BOX,,", // bad type (line 4)
      "Delhi,Pune,Di,,abc,", // bad weight (line 5)
      "Delhi,Pune,Ed,,,31/12/2026", // bad date (line 6)
      "Goa,Chennai,Fay,,,", // ok (line 7)
    ].join("\n");
    const parsed = parseShipmentsCsv(csv);
    expect(parsed.rows.map((r) => r.receiverName)).toEqual(["Asha Rao", "Fay"]);
    expect(parsed.lines).toEqual([2, 7]);
    expect(parsed.problems.map((p) => p.line)).toEqual([3, 4, 5, 6]);
    expect(parsed.problems[0]!.message).toMatch(/Missing destination/);
  });

  test("rejects a file with no usable header or no rows", () => {
    expect(parseShipmentsCsv("origin,receiverName\nA,B").problems[0]!.message).toMatch(/destination/);
    expect(parseShipmentsCsv("origin,destination,receiverName").problems[0]!.message).toMatch(/no shipments/);
    expect(parseShipmentsCsv("   ").problems).toHaveLength(1);
  });

  test("copes with a UTF-8 byte-order mark from Excel", () => {
    expect(parseShipmentsCsv("﻿origin,destination,receiverName\nA1,B1,Cc").rows).toHaveLength(1);
  });
});

describe("QR code", () => {
  test("darkRuns exactly reconstructs the module grid", () => {
    const matrix = makeQr("https://example.com/track/SHP-ABCDEFGH");
    const rebuilt = Array.from({ length: matrix.size }, () => Array<boolean>(matrix.size).fill(false));
    for (const run of darkRuns(matrix)) {
      for (let i = 0; i < run.length; i++) rebuilt[run.y]![run.x + i] = true;
    }
    for (let y = 0; y < matrix.size; y++) {
      for (let x = 0; x < matrix.size; x++) {
        expect(rebuilt[y]![x]).toBe(matrix.isDark(x, y));
      }
    }
  });

  test("has the three finder squares in the corners", () => {
    const m = makeQr("SHP-ABCDEFGH");
    for (const [cx, cy] of [[0, 0], [m.size - 7, 0], [0, m.size - 7]] as const) {
      expect(m.isDark(cx, cy)).toBe(true); // outer ring corner
      expect(m.isDark(cx + 3, cy + 3)).toBe(true); // centre
      expect(m.isDark(cx + 1, cy + 1)).toBe(false); // gap between ring and centre
    }
  });
});

describe("extractTrackingId", () => {
  test.each([
    ["SHP-7K2M9QXZ", "SHP-7K2M9QXZ"],
    ["shp-7k2m9qxz", "SHP-7K2M9QXZ"],
    ["https://tracker.example.com/track/SHP-7K2M9QXZ", "SHP-7K2M9QXZ"],
    ["shipmenttracker://track/SHP-7K2M9QXZ?x=1", "SHP-7K2M9QXZ"],
    ["  Order: SHP-7K2M9QXZ  ", "SHP-7K2M9QXZ"],
  ])("finds the ID in %p", (text, expected) => {
    expect(extractTrackingId(text)).toBe(expected);
  });

  test.each(["", "hello", "SHP-123", "SHP-0O1I0O1I", "https://example.com"])("returns null for %p", (text) => {
    expect(extractTrackingId(text)).toBeNull();
  });
});

describe("toggleSaved", () => {
  test("adds newest first, removes when already there, and caps the list", () => {
    expect(toggleSaved([], "A")).toEqual(["A"]);
    expect(toggleSaved(["A"], "B")).toEqual(["B", "A"]);
    expect(toggleSaved(["B", "A"], "A")).toEqual(["B"]);
    const full = Array.from({ length: MAX_SAVED }, (_, i) => `ID${i}`);
    const next = toggleSaved(full, "NEW");
    expect(next).toHaveLength(MAX_SAVED);
    expect(next[0]).toBe("NEW");
    expect(next).not.toContain(`ID${MAX_SAVED - 1}`);
  });
});

describe("commonNextStatuses", () => {
  test("is the intersection of what each selected shipment allows", () => {
    expect(commonNextStatuses([])).toEqual([]);
    expect(commonNextStatuses([["PICKED_UP", "ON_HOLD", "CANCELLED"]])).toEqual(["PICKED_UP", "ON_HOLD", "CANCELLED"]);
    expect(
      commonNextStatuses([
        ["PICKED_UP", "ON_HOLD", "CANCELLED"],
        ["IN_TRANSIT", "DELAYED", "ON_HOLD", "CANCELLED"],
      ]),
    ).toEqual(["ON_HOLD", "CANCELLED"]);
    expect(commonNextStatuses([["PICKED_UP"], ["IN_TRANSIT"]])).toEqual([]);
    expect(commonNextStatuses([["PICKED_UP"], []])).toEqual([]);
  });
});

describe("sinceLabel", () => {
  const now = new Date("2026-11-06T12:00:00Z").getTime();
  test("hours under two days, days after", () => {
    expect(sinceLabel("2026-11-06T07:00:00Z", now)).toBe("5h");
    expect(sinceLabel("2026-11-05T00:00:00Z", now)).toBe("36h");
    expect(sinceLabel("2026-11-01T12:00:00Z", now)).toBe("5d");
    expect(sinceLabel("2026-11-07T12:00:00Z", now)).toBe("0h"); // a clock-skewed future time never goes negative
  });
});

describe("auditFileName", () => {
  test("is dated so repeated exports don't overwrite each other", () => {
    expect(auditFileName(new Date("2026-11-11T08:30:00Z"))).toBe("audit-log-2026-11-11.csv");
  });
});
