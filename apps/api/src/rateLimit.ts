import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { config } from "./config.js";

const WINDOW_MS = 15 * 60 * 1000;

function isLoginRequest(req: Request): boolean {
  const query = (req.body as { query?: unknown } | undefined)?.query;
  return typeof query === "string" && /\blogin\s*\(/.test(query);
}

const tooMany = {
  errors: [
    {
      message: "Too many requests. Please wait a few minutes and try again.",
      extensions: { code: "RATE_LIMITED" },
    },
  ],
};

/** General per-IP cap on /graphql: stops scraping and tracking-ID guessing. */
export const apiLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: config.rateLimitMax,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS", // CORS preflights shouldn't eat the budget
  message: tooMany,
});

/** Much tighter cap on login attempts, to slow password guessing. */
export const loginLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: config.loginRateLimitMax,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => !isLoginRequest(req),
  message: tooMany,
});
