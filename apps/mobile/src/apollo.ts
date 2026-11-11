import { ApolloClient, ApolloLink, InMemoryCache, createHttpLink, from, type TypePolicies } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { ErrorLink } from "@apollo/client/link/error";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { getToken, clearToken } from "./auth/token";
import { emitSessionExpired } from "./auth/session";
import { tap } from "rxjs";
import { registerCache, schedulePersist } from "./cachePersist";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/graphql";

const httpLink = createHttpLink({ uri: API_URL });

// Live updates: the same /graphql endpoint, upgraded to a WebSocket (http -> ws, https -> wss).
const WS_URL = API_URL.replace(/^http/, "ws");

const wsClient = createClient({
  url: WS_URL,
  // Connect when the first subscription starts, not at app launch.
  lazy: true,
  // Render's free tier sleeps and restarts: keep trying, with graphql-ws's backoff.
  retryAttempts: Infinity,
  shouldRetry: () => true,
  // The token goes in the first message (browsers can't set headers on a WebSocket)
  // and is read afresh on every (re)connect.
  connectionParams: async () => {
    const token = await getToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  },
});

/**
 * Drops the socket so it reconnects with the current token. Call after login,
 * logout or an expired session; running subscriptions resume by themselves.
 */
export function resetRealtime(): void {
  wsClient.terminate();
}

// Subscriptions go over the socket; queries and mutations stay on HTTP, where the rate limits are.
const transportLink = ApolloLink.split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return definition.kind === "OperationDefinition" && definition.operation === "subscription";
  },
  new GraphQLWsLink(wsClient),
  httpLink,
);

// Attaches the admin's JWT (if any) to every outgoing request. Nothing
// here cares whether the request actually needs auth — the public
// `shipment` query just ignores a header it doesn't need.
const authLink = setContext(async (_operation, previousContext) => {
  const token = await getToken();
  return {
    headers: {
      ...previousContext.headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

// If the server ever says our token isn't good any more (expired,
// tampered, or the admin account was deleted), drop it. The Admin
// screen's own `me` query will then fail the same way and fall back
// to the login form — this is just cleanup so a stale token isn't
// retried on every subsequent request.
const errorLink = new ErrorLink(({ error, operation }) => {
  if (!CombinedGraphQLErrors.is(error)) return;
  // A failed login is also UNAUTHENTICATED (wrong password) — that's not
  // an expired session, so don't clear anything or announce one.
  if (operation.operationName === "Login") return;
  const isUnauthenticated = error.errors.some(
    (graphQLError) => graphQLError.extensions?.code === "UNAUTHENTICATED",
  );
  if (isUnauthenticated) {
    // Clear first, then notify: listeners may immediately re-read the token.
    clearToken().finally(() => {
      resetRealtime();
      emitSessionExpired();
    });
  }
});

// After every response, queue a (debounced) save of the cache to disk.
const persistLink = new ApolloLink((operation, forward) =>
  forward(operation).pipe(tap(() => schedulePersist())),
);

export const typePolicies: TypePolicies =  {
      Query: {
        fields: {
          // Admin list. `status` and `search` identify a distinct list;
          // `cursor` and `limit` do not — they just say which slice of that
          // list to load. Excluding them from keyArgs is what lets fetchMore
          // append to ONE cached list instead of creating one per cursor.
          shipments: {
            keyArgs: ["status", "search"],
            merge(existing, incoming, { args, readField }) {
              // No cursor = first page (initial load or a refetch): replace,
              // otherwise a refetch would append the first page a second time.
              if (!args?.cursor || !existing) return incoming;
              const seen = new Set(existing.items.map((item: any) => readField("id", item)));
              const fresh = incoming.items.filter((item: any) => !seen.has(readField("id", item)));
              return { ...incoming, items: [...existing.items, ...fresh] };
            },
          },
        },
      },
    };

export const cache = new InMemoryCache({ typePolicies });
registerCache(cache, typePolicies);

export const apolloClient = new ApolloClient({
  link: from([errorLink, persistLink, authLink, transportLink]),
  cache,
});
