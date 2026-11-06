/** The main path a shipment travels. */
export const REGULAR_STATUSES = [
  "CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

/** Things that can go wrong along the way. RETURNED and CANCELLED are final. */
export const EXCEPTION_STATUSES = [
  "DELAYED",
  "ON_HOLD",
  "DELIVERY_ATTEMPT_FAILED",
  "RETURNED",
  "CANCELLED",
] as const;

export const SHIPMENT_STATUSES = [...REGULAR_STATUSES, ...EXCEPTION_STATUSES] as const;

export function isExceptionStatus(status: ShipmentStatus): boolean {
  return (EXCEPTION_STATUSES as readonly string[]).includes(status);
}

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const PACKAGE_TYPES = ["DOCUMENT", "PARCEL", "FRAGILE", "ELECTRONICS", "OTHER"] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

export type StatusEvent = {
  __typename?: "StatusEvent";
  status: ShipmentStatus;
  location: string;
  note?: string | null;
  timestamp: string;
};

export type Shipment = {
  __typename?: "Shipment";
  id: string;
  trackingId: string;
  origin: string;
  destination: string;
  receiverName: string;
  senderName?: string | null;
  /** Masked (last 4 digits) unless the viewer is a logged-in admin. */
  receiverPhone?: string | null;
  packageType?: PackageType | null;
  weightKg?: number | null;
  description?: string | null;
  /** ISO date-time, or null when no estimate was given. */
  estimatedDelivery?: string | null;
  currentStatus: ShipmentStatus;
  /** Computed by the API: the statuses this shipment may move to next. */
  allowedNextStatuses?: ShipmentStatus[];
  history: StatusEvent[];
};
