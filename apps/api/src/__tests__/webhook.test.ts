import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from "@jest/globals";
import { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } from "./setup.js";
import { Shipment } from "../models/Shipment.js";
import { config } from "../config.js";
import * as shipmentService from "../services/shipmentService.js";
import { formatAlert } from "../services/notifier.js";

const SLACK_URL = "https://hooks.slack.com/services/TEST/TEST/fake";
const DISCORD_URL = "https://discord.com/api/webhooks/1/fake";

let fetchMock: jest.SpiedFunction<typeof fetch>;

beforeAll(async () => {
  await connectTestDatabase();
}, 60000);

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  config.webhookUrl = SLACK_URL;
  config.webhookStatuses = ["DELAYED", "ON_HOLD", "DELIVERY_ATTEMPT_FAILED"];
  fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));
});

afterEach(() => {
  fetchMock.mockRestore();
  config.webhookUrl = undefined;
});

function makeShipment() {
  return Shipment.create({
    trackingId: "SHP-HOOK0001",
    origin: "Delhi",
    destination: "Mumbai",
    receiverName: "Asha Rao",
    receiverPhone: "9876543210",
    deliveryOtp: "4821",
    currentStatus: "IN_TRANSIT",
    history: [
      { status: "CREATED", location: "Delhi" },
      { status: "PICKED_UP", location: "Delhi" },
      { status: "IN_TRANSIT", location: "Nagpur" },
    ],
  });
}

describe("status-change webhook", () => {
  test("posts an alert when a shipment becomes DELAYED", async () => {
    await makeShipment();
    await shipmentService.updateStatus(
      { trackingId: "SHP-HOOK0001", status: "DELAYED", location: "Nagpur", note: "Heavy rain" },
      "ops@example.com",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(SLACK_URL);
    const text = JSON.parse(String((init as RequestInit).body)).text as string;
    expect(text).toContain("SHP-HOOK0001");
    expect(text).toContain("DELAYED");
    expect(text).toContain("Heavy rain");
    expect(text).toContain("ops@example.com");
  });

  test("never includes the receiver's name, phone or delivery code", async () => {
    await makeShipment();
    await shipmentService.updateStatus({ trackingId: "SHP-HOOK0001", status: "ON_HOLD", location: "Nagpur", note: "Paperwork" });
    const body = String((fetchMock.mock.calls[0]![1] as RequestInit).body);
    for (const secret of ["Asha", "9876543210", "4821"]) expect(body).not.toContain(secret);
  });

  test("stays quiet for statuses that aren't configured", async () => {
    await makeShipment();
    await shipmentService.updateStatus({ trackingId: "SHP-HOOK0001", status: "OUT_FOR_DELIVERY", location: "Mumbai" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("does nothing when no webhook URL is configured", async () => {
    config.webhookUrl = undefined;
    await makeShipment();
    await shipmentService.updateStatus({ trackingId: "SHP-HOOK0001", status: "DELAYED", location: "Nagpur", note: "Rain" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("does not alert when the update is rejected", async () => {
    await makeShipment();
    await expect(
      shipmentService.updateStatus({ trackingId: "SHP-HOOK0001", status: "DELIVERED", location: "x", deliveredTo: "a" }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a failing webhook never fails the status update", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await makeShipment();
    const updated = await shipmentService.updateStatus({ trackingId: "SHP-HOOK0001", status: "DELAYED", location: "Nagpur", note: "Rain" });
    expect(updated.currentStatus).toBe("DELAYED");
  });

  test("a non-2xx webhook response doesn't fail the update either", async () => {
    fetchMock.mockResolvedValue(new Response("invalid_token", { status: 403 }));
    await makeShipment();
    const updated = await shipmentService.updateStatus({ trackingId: "SHP-HOOK0001", status: "ON_HOLD", location: "Nagpur", note: "Hold" });
    expect(updated.currentStatus).toBe("ON_HOLD");
  });
});

describe("formatAlert", () => {
  const alert = {
    trackingId: "SHP-1",
    status: "DELAYED" as const,
    origin: "Delhi",
    destination: "Mumbai",
    location: "Nagpur",
    note: "<!channel> truck & driver late",
  };

  test("escapes Slack control characters in free text", () => {
    const text = formatAlert(alert);
    expect(text).not.toContain("<!channel>");
    expect(text).toContain("&lt;!channel&gt; truck &amp; driver late");
  });

  test("uses Discord bold and plain text for Discord", () => {
    const text = formatAlert(alert, true);
    expect(text).toContain("**SHP-1**");
    expect(text).toContain("<!channel>");
  });

  test("posts Discord's {content} shape to a Discord URL", async () => {
    config.webhookUrl = DISCORD_URL;
    await makeShipment();
    await shipmentService.updateStatus({ trackingId: "SHP-HOOK0001", status: "DELAYED", location: "Nagpur", note: "Rain" });
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body.content).toContain("SHP-HOOK0001");
    expect(body.text).toBeUndefined();
  });
});
