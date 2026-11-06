import "dotenv/config";

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
  corsOrigins: (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
