import { config } from "../config.js";
import { logger } from "../logger.js";
import type { ShipmentStatus } from "../domain/status.js";

/** What the alert needs. Deliberately no receiver name, phone or delivery code. */
export type StatusChangeAlert = {
  trackingId: string;
  status: ShipmentStatus;
  origin: string;
  destination: string;
  location: string;
  note?: string | null;
  by?: string | null;
};

const TIMEOUT_MS = 5000;

const EMOJI: Partial<Record<ShipmentStatus, string>> = {
  DELAYED: ":hourglass_flowing_sand:",
  ON_HOLD: ":octagonal_sign:",
  DELIVERY_ATTEMPT_FAILED: ":x:",
  RETURNED: ":leftwards_arrow_with_hook:",
  CANCELLED: ":no_entry_sign:",
};

/** Slack treats & < > specially (links, @channel); neutralise them in user-typed text. */
function escapeSlack(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isDiscord(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "discord.com" || host.endsWith(".discord.com") || host === "discordapp.com";
  } catch {
    return false;
  }
}

export function formatAlert(alert: StatusChangeAlert, discord = false): string {
  const bold = discord ? "**" : "*";
  const esc = discord ? (s: string) => s : escapeSlack;
  const label = alert.status.replace(/_/g, " ");
  const lines = [
    `${EMOJI[alert.status] ?? ":package:"} ${bold}${esc(alert.trackingId)}${bold} is now ${bold}${label}${bold}`,
    `Route: ${esc(alert.origin)} → ${esc(alert.destination)}`,
    `Location: ${esc(alert.location)}`,
  ];
  if (alert.note?.trim()) lines.push(`Reason: ${esc(alert.note.trim())}`);
  if (alert.by) lines.push(`Updated by: ${esc(alert.by)}`);
  return lines.join("\n");
}

async function post(url: string, text: string): Promise<boolean> {
  const body = isDiscord(url) ? { content: text } : { text };
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    logger.warn({ status: response.status }, "webhook rejected the alert");
    return false;
  }
  return true;
}

/**
 * Sends a Slack/Discord message when a shipment moves into one of the
 * configured problem statuses. It never throws: a down or misconfigured
 * webhook must not make a status update fail, so errors are only logged.
 * The URL itself is a secret and is never logged.
 */
export async function notifyStatusChange(alert: StatusChangeAlert): Promise<void> {
  const url = config.webhookUrl;
  if (!url || !config.webhookStatuses.includes(alert.status)) return;
  try {
    await post(url, formatAlert(alert, isDiscord(url)));
  } catch (err) {
    logger.warn({ err: (err as Error).name }, "webhook delivery failed");
  }
}

/** Sends a one-off message, for checking that a webhook URL works. */
export function sendTestMessage(url: string, text: string): Promise<boolean> {
  return post(url, text);
}
