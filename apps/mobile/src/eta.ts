import { dateLocale, getLang, translate, type Lang } from "./i18n";
import type { Shipment } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatDay(date: Date, lang: Lang): string {
  return date.toLocaleDateString(dateLocale(lang), { weekday: "short", day: "numeric", month: "short" });
}

export type EtaInfo = { text: string; overdue: boolean };

/**
 * The one line the Track screen shows about timing, or null if there is
 * nothing useful to say. Compares calendar days (not hours) so "Arriving
 * today" stays true all day.
 */
export function describeEta(
  shipment: Pick<Shipment, "currentStatus" | "estimatedDelivery" | "history">,
  now: Date = new Date(),
  lang: Lang = getLang(),
): EtaInfo | null {
  const last = shipment.history[shipment.history.length - 1];
  const reason = last?.note ? `: ${last.note}` : "";
  const say = (key: Parameters<typeof translate>[0], params?: Record<string, string>) => translate(key, params, lang);

  switch (shipment.currentStatus) {
    case "DELIVERED":
      return last ? { text: say("eta.delivered", { date: formatDay(new Date(last.timestamp), lang) }), overdue: false } : null;
    case "RETURNED":
      return { text: say("eta.returned", { reason }), overdue: true };
    case "CANCELLED":
      return { text: say("eta.cancelled", { reason }), overdue: true };
    case "ON_HOLD":
      return { text: say("eta.onHold", { reason }), overdue: true };
    case "DELAYED":
      return { text: say("eta.delayed", { reason }), overdue: true };
    case "DELIVERY_ATTEMPT_FAILED":
      return { text: say("eta.attemptFailed", { reason }), overdue: true };
  }
  if (!shipment.estimatedDelivery) return null;

  const eta = new Date(shipment.estimatedDelivery);
  const days = Math.round((startOfDay(eta) - startOfDay(now)) / DAY_MS);

  if (days < 0) return { text: say("eta.late", { date: formatDay(eta, lang) }), overdue: true };
  if (days === 0) return { text: say("eta.today"), overdue: false };
  if (days === 1) return { text: say("eta.tomorrow"), overdue: false };
  return { text: say("eta.by", { date: formatDay(eta, lang) }), overdue: false };
}

/** An ISO date-time `days` days from now at noon local time, for the admin ETA chips. */
export function etaInDays(days: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12, 0, 0);
  return d.toISOString();
}
