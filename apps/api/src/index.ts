import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { ApolloServer } from "@apollo/server";
import type { GraphQLFormattedError } from "graphql";
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled";
import { expressMiddleware } from "@as-integrations/express5";

import { config } from "./config.js";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers/index.js";
import { buildContext, type GraphQLContext } from "./context.js";
import { Shipment } from "./models/Shipment.js";
import { Admin } from "./models/Admin.js";
import { depthLimit } from "./depthLimit.js";
import { apiLimiter, loginLimiter } from "./rateLimit.js";
import { logger, requestLogger } from "./logger.js";

async function main() {
  await mongoose.connect(config.mongodbUri);

  if (!config.isProduction) {
    // Keeps local/dev databases in sync with the schema's indexes
    // (notably the unique trackingId index) without a manual migration
    // step. Atlas is seeded once via `npm run seed`, not synced here.
    await Promise.all([Shipment.syncIndexes(), Admin.syncIndexes()]);
  }

  const server = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    validationRules: [depthLimit(8)],
    introspection: !config.isProduction,
    plugins: config.isProduction ? [ApolloServerPluginLandingPageDisabled()] : [],
    formatError: (formattedError, error): GraphQLFormattedError => {
      const code = formattedError.extensions?.code;
      const isKnownError = typeof code === "string" && code !== "INTERNAL_SERVER_ERROR";

      if (!isKnownError) {
        // Anything we didn't deliberately throw (a bug, a DB hiccup) is
        // logged in full server-side but never echoed to the client.
        logger.error({ err: error }, "Unhandled GraphQL error");
        if (config.isProduction) {
          return {
            message: "Internal server error.",
            extensions: { code: "INTERNAL_SERVER_ERROR" },
          };
        }
      }

      return formattedError;
    },
  });

  await server.start();

  const app = express();
  // Render (and most hosts) sit behind a proxy; without this every client
  // would share the proxy's IP and one noisy user would rate-limit everyone.
  app.set("trust proxy", 1);
  app.use(
    cors({
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  // /healthz is polled by the host every few seconds; logging it would bury real traffic.
  app.use("/graphql", requestLogger);

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/graphql", apiLimiter, loginLimiter);
  app.use("/graphql", expressMiddleware(server, { context: buildContext }));

  app.listen(config.port, () => {
    logger.info({ port: config.port, requireAdmin: config.requireAdmin }, "API ready");
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});
