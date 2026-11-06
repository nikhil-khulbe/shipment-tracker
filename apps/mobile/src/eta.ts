import type { Shipment } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export type EtaInfo = { text: string; overdue: boolean };

/**
 * The one line the Track screen shows about timing, or null if there is
 * nothing useful to say. Compares calendar days (not hours) so "Arriving
 * today" stays true all day.
 */
export function describeEta(shipment: Pick<Shipment, "currentStatus" | "estimatedDelivery" | "history">, now: Date = new Date()): EtaInfo | null {
  if (shipment.currentStatus === "DELIVERED") {
    const delivered = shipment.history[shipment.history.length - 1];
    return delivered ? { text: `Delivered on ${formatDay(new Date(delivered.timestamp))}`, overdue: false } : null;
  }
  if (!shipment.estimatedDelivery) return null;

  const eta = new Date(shipment.estimatedDelivery);
  const days = Math.round((startOfDay(eta) - startOfDay(now)) / DAY_MS);

  if (days < 0) return { text: `Was expected by ${formatDay(eta)}, running late`, overdue: true };
  if (days === 0) return { text: "Arriving today", overdue: false };
  if (days === 1) return { text: "Arriving tomorrow", overdue: false };
  return { text: `Arriving by ${formatDay(eta)}`, overdue: false };
}

/** An ISO date-time `days` days from now at noon local time, for the admin ETA chips. */
export function etaInDays(days: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12, 0, 0);
  return d.toISOString();
}
