import { render, screen } from "@testing-library/react-native";
import { StatusBadge } from "../components/StatusBadge";
import { ShipmentHeaderCard } from "../components/ShipmentHeaderCard";
import { QrCode } from "../components/QrCode";
import type { Shipment } from "../types";

const shipment = (overrides: Partial<Shipment> = {}): Shipment => ({
  id: "1",
  trackingId: "SHP-TEST0001",
  origin: "Delhi",
  destination: "Mumbai",
  receiverName: "Asha Rao",
  currentStatus: "IN_TRANSIT",
  history: [
    { status: "CREATED", location: "Delhi", timestamp: "2026-11-01T10:00:00.000Z" },
    { status: "IN_TRANSIT", location: "Nagpur", timestamp: "2026-11-02T10:00:00.000Z" },
  ],
  ...overrides,
});

describe("StatusBadge", () => {
  test.each([
    ["CREATED", "Created"],
    ["OUT_FOR_DELIVERY", "Out for Delivery"],
    ["DELAYED", "Delayed"],
    ["DELIVERY_ATTEMPT_FAILED", "Delivery Failed"],
    ["CANCELLED", "Cancelled"],
  ] as const)("shows the text label for %s (never colour alone)", async (status, label) => {
    await render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});

describe("ShipmentHeaderCard", () => {
  test("shows the route, receiver and only the details that exist", async () => {
    await render(
      <ShipmentHeaderCard
        shipment={shipment({ packageType: "FRAGILE", weightKg: 2.5, senderName: "Ravi Kumar", receiverPhone: "••••••3210" })}
      />,
    );
    expect(screen.getByText("SHP-TEST0001")).toBeTruthy();
    expect(screen.getByText("Delhi")).toBeTruthy();
    expect(screen.getByText("Mumbai")).toBeTruthy();
    expect(screen.getByText(/Receiver: Asha Rao/)).toBeTruthy();
    expect(screen.getByText(/3210/)).toBeTruthy();
    expect(screen.getByText(/Fragile/)).toBeTruthy();
    expect(screen.getByText(/2\.5 kg/)).toBeTruthy();
    expect(screen.getByText(/From Ravi Kumar/)).toBeTruthy();
  });

  test("an older shipment with no extra details renders without them", async () => {
    await render(<ShipmentHeaderCard shipment={shipment()} />);
    expect(screen.queryByText(/ kg/)).toBeNull();
    expect(screen.queryByText(/From /)).toBeNull();
  });

  test("a delayed shipment shows the reason", async () => {
    await render(
      <ShipmentHeaderCard
        shipment={shipment({
          currentStatus: "DELAYED",
          history: [
            { status: "CREATED", location: "Delhi", timestamp: "2026-11-01T10:00:00.000Z" },
            { status: "DELAYED", location: "Nagpur", note: "Heavy rain", timestamp: "2026-11-02T10:00:00.000Z" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Delayed: Heavy rain")).toBeTruthy();
  });
});

describe("QrCode", () => {
  test("renders, and is described for screen readers", async () => {
    await render(<QrCode value="https://example.com/track/SHP-TEST0001" size={120} />);
    expect(screen.getByLabelText("QR code for https://example.com/track/SHP-TEST0001")).toBeTruthy();
  });
});
