import { GraphQLError } from "graphql";
import { Admin } from "./models/Admin.js";

/**
 * One factory per error case (see PLAN.md §3 for the full table), each
 * tagged with extensions.code so the client can switch on it, and
 * extensions.http.status so the HTTP status matches the semantics.
 */

export type AdminContext = { id: string; email: string };

export function badUserInput(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
  });
}

export function unauthenticated(message = "You must be logged in to do that."): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
  });
}

export function forbidden(message = "Your account no longer has access."): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "FORBIDDEN", http: { status: 403 } },
  });
}

export function notFound(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "NOT_FOUND", http: { status: 404 } },
  });
}

export function invalidStatusTransition(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "INVALID_STATUS_TRANSITION", http: { status: 400 } },
  });
}

export function duplicateTrackingId(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "DUPLICATE_TRACKING_ID", http: { status: 409 } },
  });
}

export type Role = "ADMIN" | "DRIVER";
export type AuthedAdmin = AdminContext & { role: Role };

/**
 * The caller's role, looked up in the database (never trusted from the JWT, so
 * deleting or demoting an account takes effect immediately). Memoised per
 * request: the context object is created once per request, so a field that
 * is resolved 20 times costs one query.
 */
const roleCache = new WeakMap<object, Promise<Role | null>>();

export function currentRole(context: { admin: AdminContext | null }): Promise<Role | null> {
  if (!context.admin) return Promise.resolve(null);
  let cached = roleCache.get(context);
  if (!cached) {
    cached = Admin.findById(context.admin.id)
      .lean()
      .then((doc) => (doc ? ((doc.role as Role | undefined) ?? "ADMIN") : null));
    roleCache.set(context, cached);
  }
  return cached;
}

/**
 * Forget the memoised role. A normal request lives for milliseconds, but a
 * WebSocket subscription's context lives for hours, so it calls this before
 * handling each event to notice a deleted or demoted account.
 */
export function invalidateRole(context: object): void {
  roleCache.delete(context);
}

/**
 * Throws UNAUTHENTICATED if no admin is attached to the request context,
 * FORBIDDEN if that account has since been deleted or its role isn't one of
 * `roles`. Every admin-only resolver's first line goes through this.
 */
export async function requireAdmin(
  context: { admin: AdminContext | null },
  roles?: readonly Role[],
): Promise<AuthedAdmin> {
  if (!context.admin) {
    throw unauthenticated();
  }
  const role = await currentRole(context);
  if (!role) {
    throw forbidden();
  }
  if (roles && !roles.includes(role)) {
    throw forbidden("Your role is not allowed to do that.");
  }
  return { ...context.admin, role };
}
