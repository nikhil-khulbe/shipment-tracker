import { ApolloServer } from "@apollo/server";
import { typeDefs } from "../schema.js";
import { resolvers } from "../resolvers/index.js";
import type { GraphQLContext } from "../context.js";

export function createTestServer(): ApolloServer<GraphQLContext> {
  return new ApolloServer<GraphQLContext>({ typeDefs, resolvers });
}

type GraphQLResponseBody =
  | { kind: "single"; singleResult: { data?: unknown; errors?: readonly { message: string; extensions?: Record<string, unknown> }[] } }
  | { kind: "incremental" };

/**
 * Runs one GraphQL operation against the test server and returns the
 * single-result body, pre-unwrapped. `admin` stands in for whatever
 * context.ts would have derived from a real Authorization header —
 * pass null for an anonymous request, or { id, email } to simulate a
 * logged-in admin, without needing a real JWT in most tests.
 */
export async function execute(
  server: ApolloServer<GraphQLContext>,
  options: { query: string; variables?: Record<string, unknown>; admin?: { id: string; email: string } | null },
) {
  const response = await server.executeOperation(
    { query: options.query, variables: options.variables },
    { contextValue: { admin: options.admin ?? null } },
  );
  const body = response.body as GraphQLResponseBody;
  if (body.kind !== "single") {
    throw new Error("Expected a single GraphQL result in tests, got an incremental one.");
  }
  return body.singleResult;
}
