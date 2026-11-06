import type { ComponentProps } from "react";
import type Ionicons from "@expo/vector-icons/Ionicons";
import { translate, type Lang } from "../i18n";
import { isExceptionStatus, REGULAR_STATUSES, type Shipment, type ShipmentStatus } from "../types";

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  CREATED: "Created",
  PICKED_UP: "Picked Up",
  IN_TRANSIT: "In Transit",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  DELAYED: "Delayed",
  ON_HOLD: "On Hold",
  DELIVERY_ATTEMPT_FAILED: "Delivery Failed",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
};

/** The status name in the given language. (STATUS_LABELS above stays English: the staff screens aren't translated.) */
export function statusLabel(status: ShipmentStatus, lang?: Lang): string {
  return translate(`status.${status}`, undefined, lang);
}

export const STATUS_ICONS: Record<ShipmentStatus, ComponentProps<typeof Ionicons>["name"]> = {
  CREATED: "cube-outline",
  PICKED_UP: "bag-check-outline",
  IN_TRANSIT: "car-outline",
  OUT_FOR_DELIVERY: "bicycle-outline",
  DELIVERED: "checkmark-circle",
  DELAYED: "time-outline",
  ON_HOLD: "pause-circle-outline",
  DELIVERY_ATTEMPT_FAILED: "alert-circle-outline",
  RETURNED: "return-up-back-outline",
  CANCELLED: "close-circle-outline",
};

/**
 * 0..1 progress along the main path, for the progress bar. A shipment in an
 * exception status keeps the progress of the last main-path status it
 * reached (a delayed parcel is still where it was). RETURNED and CANCELLED
 * are over, so they show as empty.
 */
export function shipmentProgress(shipment: Pick<Shipment, "currentStatus" | "history">): number {
  const { currentStatus } = shipment;
  if (currentStatus === "RETURNED" || currentStatus === "CANCELLED") return 0;
  let reached: ShipmentStatus = currentStatus;
  if (isExceptionStatus(currentStatus)) {
    reached = "CREATED";
    for (const event of shipment.history) {
      if (!isExceptionStatus(event.status)) reached = event.status;
    }
  }
  return REGULAR_STATUSES.indexOf(reached as (typeof REGULAR_STATUSES)[number]) / (REGULAR_STATUSES.length - 1);
}
