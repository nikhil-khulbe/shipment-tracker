import "dotenv/config";
import { isShipmentStatus, type ShipmentStatus } from "./domain/status.js";

/**
 * Reads and validates process.env once at boot. Fails fast and loud —
 * a server that starts without a real secret and 500s on first request
 * is worse than one that refuses to start at all.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Only a valid https URL counts; anything else disables alerts rather than crashing boot. */
function parseWebhookUrl(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

const DEFAULT_WEBHOOK_STATUSES: ShipmentStatus[] = ["DELAYED", "ON_HOLD", "DELIVERY_ATTEMPT_FAILED"];

function parseWebhookStatuses(raw: string | undefined): ShipmentStatus[] {
  if (!raw?.trim()) return DEFAULT_WEBHOOK_STATUSES;
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(isShipmentStatus);
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 4000),
  mongodbUri: required("MONGODB_URI"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  /**
   * When true (the default) the admin operations need a valid admin JWT.
   * Set REQUIRE_ADMIN=false to run an open demo where anyone can create and
   * update shipments. Defaulting to locked means forgetting the variable
   * fails safe.
   */
  requireAdmin: process.env.REQUIRE_ADMIN !== "false",
  /** Requests per IP per window on /graphql. */
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 300),
  /** Login attempts per IP per window. */
  loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10),
  /**
   * Optional Slack (or Discord) incoming-webhook URL. Unset = no alerts.
   * It is a secret: anyone with it can post to the channel.
   */
  webhookUrl: parseWebhookUrl(process.env.WEBHOOK_URL),
  /** Statuses that trigger an alert. Override with WEBHOOK_STATUSES=DELAYED,CANCELLED,... */
  webhookStatuses: parseWebhookStatuses(process.env.WEBHOOK_STATUSES),
  /** Concurrent WebSocket connections allowed per client IP. */
  wsMaxConnectionsPerIp: Number(process.env.WS_MAX_CONNECTIONS_PER_IP ?? 20),
  corsOrigins: (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
