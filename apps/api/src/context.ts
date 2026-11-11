import type { Request } from "express";
import { verifyToken, type JwtPayload } from "./services/authService.js";

export type AdminContext = { id: string; email: string };

export type GraphQLContext = {
  admin: AdminContext | null;
  /** When the JWT stops being valid (ms since epoch). Only long-lived WebSocket connections need it. */
  tokenExpiresAt?: number;
};

/**
 * Built once per request. Never throws here — an invalid/missing token
 * just means context.admin is null, which lets the public `shipment`
 * query through untouched. It's requireAdmin() (see errors.ts) that
 * turns "no admin" into an UNAUTHENTICATED error, and only on the
 * resolvers that actually need one.
 */
export function contextFromAuthorization(header: string | null | undefined): GraphQLContext {
  if (!header?.startsWith("Bearer ")) {
    return { admin: null };
  }

  const token = header.slice("Bearer ".length).trim();
  const payload: JwtPayload | null = verifyToken(token);
  if (!payload) {
    return { admin: null };
  }

  return {
    admin: { id: payload.sub, email: payload.email },
    tokenExpiresAt: payload.exp ? payload.exp * 1000 : undefined,
  };
}

export async function buildContext({ req }: { req: Request }): Promise<GraphQLContext> {
  return contextFromAuthorization(req.headers.authorization);
}
