import { GraphQLError } from "graphql";

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

/**
 * Throws UNAUTHENTICATED if no admin is attached to the request context,
 * then FORBIDDEN if that admin's account has since been deleted. Every
 * admin-only resolver's first line is `const admin = await requireAdmin(ctx)`.
 */
export async function requireAdmin(
  context: { admin: AdminContext | null },
  AdminModel: { exists: (filter: { _id: string }) => Promise<unknown> },
): Promise<AdminContext> {
  if (!context.admin) {
    throw unauthenticated();
  }
  const stillExists = await AdminModel.exists({ _id: context.admin.id });
  if (!stillExists) {
    throw forbidden();
  }
  return context.admin;
}
