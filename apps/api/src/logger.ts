import pino from "pino";
import type { NextFunction, Request, Response } from "express";

/**
 * One JSON line per event, so a host's log viewer can filter on fields
 * (level, status, ms) instead of grepping prose. Quiet under Jest.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: undefined, // no pid/hostname noise
  timestamp: pino.stdTimeFunctions.isoTime,
  // Defence in depth: even if something logs a request by accident, secrets are blanked.
  redact: ["req.headers.authorization", "*.password", "*.token", "*.otp", "*.deliveryOtp"],
});

/**
 * Logs one line per finished request: method, path, status, duration, IP and
 * the GraphQL operation name. Deliberately never logs the body or variables,
 * which carry passwords and delivery codes.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const operation = typeof req.body?.operationName === "string" ? req.body.operationName : undefined;
    logger[res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"](
      {
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        ms: Math.round(ms),
        ip: req.ip,
        operation,
      },
      "request",
    );
  });
  next();
}
