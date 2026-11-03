export const SHIPMENT_STATUSES = [
  "CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export type StatusEvent = {
  status: ShipmentStatus;
  location: string;
  note?: string | null;
  timestamp: string;
};

export type Shipment = {
  id: string;
  trackingId: string;
  origin: string;
  destination: string;
  receiverName: string;
  currentStatus: ShipmentStatus;
  history: StatusEvent[];
};
