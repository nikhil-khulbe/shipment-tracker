import type { GraphQLContext } from "./context.js";
import { config } from "./config.js";
import { currentRole, invalidateRole } from "./errors.js";

/**
 * A subscription's context is created once, when it starts, and can live for
 * hours. Anything about the caller that can change in the meantime has to be
 * re-checked as events arrive, or a removed account would keep receiving data.
 */

/** Once the login token has expired, treat the connection as anonymous. */
export function expireStaleToken(context: GraphQLContext, now = Date.now()): void {
  if (context.tokenExpiresAt !== undefined && now >= context.tokenExpiresAt) {
    context.admin = null;
  }
}

/**
 * Wraps an event source. Before each event it forgets the memoised role so the
 * field resolvers look the account up again. With `staffOnly`, the stream ends
 * as soon as the caller is no longer valid staff (token expired, account
 * deleted).
 */
export async function* liveEvents<T>(
  context: GraphQLContext,
  source: AsyncIterableIterator<T>,
  options: { staffOnly: boolean },
): AsyncGenerator<T, void, undefined> {
  for await (const event of source) {
    expireStaleToken(context);
    invalidateRole(context);
    if (options.staffOnly && config.requireAdmin && !(await currentRole(context))) return;
    yield event;
  }
}
