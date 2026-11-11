import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers/index.js";

/** One schema object shared by the HTTP (Apollo) and WebSocket (graphql-ws) servers. */
export const schema = makeExecutableSchema({ typeDefs, resolvers });
