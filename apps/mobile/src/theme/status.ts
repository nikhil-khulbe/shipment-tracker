import type { ComponentProps } from "react";
import type Ionicons from "@expo/vector-icons/Ionicons";
import { SHIPMENT_STATUSES, type ShipmentStatus } from "../types";

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  CREATED: "Created",
  PICKED_UP: "Picked Up",
  IN_TRANSIT: "In Transit",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
};

export const STATUS_ICONS: Record<ShipmentStatus, ComponentProps<typeof Ionicons>["name"]> = {
  CREATED: "cube-outline",
  PICKED_UP: "bag-check-outline",
  IN_TRANSIT: "car-outline",
  OUT_FOR_DELIVERY: "bicycle-outline",
  DELIVERED: "checkmark-circle",
};

/** 0..1 progress through the status machine, for the progress bar. */
export function statusProgress(status: ShipmentStatus): number {
  return SHIPMENT_STATUSES.indexOf(status) / (SHIPMENT_STATUSES.length - 1);
}
