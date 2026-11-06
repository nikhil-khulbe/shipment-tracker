/**
 * Pure helpers for the optional shipment details. No Mongo, no GraphQL.
 */

export const PACKAGE_TYPES = ["DOCUMENT", "PARCEL", "FRAGILE", "ELECTRONICS", "OTHER"] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parses an estimated-delivery input (ISO date or date-time). Returns null
 * when it isn't a real date, or is more than a day in the past (a typo like
 * 2024 instead of 2026 is far more likely than a genuinely back-dated ETD).
 */
export function parseEstimatedDelivery(raw: string, now: Date = new Date()): Date | null {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getTime() < now.getTime() - DAY_MS) return null;
  return date;
}

const BULLET = "•";

/**
 * Hides all but the last 4 digits of a phone number for anonymous viewers:
 * a tracking ID is not a secret, so it must not unlock a stranger's number.
 * "+91 98765 43210" becomes six bullets followed by "3210".
 * Returns null for an empty value.
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return BULLET.repeat(4);
  return BULLET.repeat(6) + digits.slice(-4);
}
