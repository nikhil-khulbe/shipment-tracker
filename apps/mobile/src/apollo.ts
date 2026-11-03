import { ApolloClient, InMemoryCache, createHttpLink, from } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { ErrorLink } from "@apollo/client/link/error";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { getToken, clearToken } from "./auth/token";
import { emitSessionExpired } from "./auth/session";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/graphql";

const httpLink = createHttpLink({ uri: API_URL });

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
    clearToken().finally(emitSessionExpired);
  }
});

export const apolloClient = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache: new InMemoryCache(),
});
