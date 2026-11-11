import type { IncomingMessage, Server } from "node:http";
import {
  GraphQLError,
  Kind,
  NoSchemaIntrospectionCustomRule,
  parse,
  specifiedRules,
  validate,
  type GraphQLSchema,
} from "graphql";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/use/ws";
import { config } from "./config.js";
import { contextFromAuthorization } from "./context.js";
import { depthLimit } from "./depthLimit.js";
import { logger } from "./logger.js";

export const MAX_SUBSCRIPTIONS_PER_CONNECTION = 10;
const MAX_PAYLOAD_BYTES = 64 * 1024;
/** Pings keep idle sockets alive through hosts that drop quiet connections. */
const KEEP_ALIVE_MS = 12_000;

/**
 * The address the proxy saw. With `trust proxy 1` Express takes the last
 * X-Forwarded-For entry (the one our own proxy appended); a client can't forge it.
 */
function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const last = (Array.isArray(forwarded) ? forwarded.join(",") : forwarded)?.split(",").pop()?.trim();
  return last || req.socket.remoteAddress || "unknown";
}

/**
 * Attaches a graphql-ws server at /graphql on the same HTTP server.
 *
 * Only subscriptions are accepted. Queries and mutations stay on HTTP, where
 * the rate limiters live; otherwise a socket would be a way around the login
 * limit. Operations are validated with the same depth limit as HTTP, and
 * introspection is off in production.
 */
export function attachRealtime(httpServer: Server, schema: GraphQLSchema) {
  const connectionsPerIp = new Map<string, number>();

  const wss = new WebSocketServer({
    server: httpServer,
    path: "/graphql",
    maxPayload: MAX_PAYLOAD_BYTES,
    verifyClient: ({ req }, done) => {
      if ((connectionsPerIp.get(clientIp(req)) ?? 0) >= config.wsMaxConnectionsPerIp) {
        done(false, 429, "Too many connections");
      } else {
        done(true);
      }
    },
  });

  wss.on("connection", (socket, req) => {
    const ip = clientIp(req);
    connectionsPerIp.set(ip, (connectionsPerIp.get(ip) ?? 0) + 1);
    socket.once("close", () => {
      const left = (connectionsPerIp.get(ip) ?? 1) - 1;
      if (left <= 0) connectionsPerIp.delete(ip);
      else connectionsPerIp.set(ip, left);
    });
  });

  const rules = [
    ...specifiedRules,
    depthLimit(8),
    ...(config.isProduction ? [NoSchemaIntrospectionCustomRule] : []),
  ];

  const cleanup = useServer(
    {
      schema,
      // Auth travels in the connection_init message (browsers can't set headers on a WebSocket).
      context: (ctx) => {
        const authorization = (ctx.connectionParams as { authorization?: unknown } | undefined)?.authorization;
        return contextFromAuthorization(typeof authorization === "string" ? authorization : undefined);
      },
      onSubscribe: (ctx, _id, payload) => {
        // graphql-ws registers this subscription (as a placeholder) before calling us,
        // so the count already includes it, and includes ones still starting up.
        if (Object.keys(ctx.subscriptions).length > MAX_SUBSCRIPTIONS_PER_CONNECTION) {
          return [new GraphQLError("Too many subscriptions on this connection.")];
        }
        let document;
        try {
          document = parse(payload.query);
        } catch (err) {
          return [err as GraphQLError];
        }
        const notSubscription = document.definitions.some(
          (def) => def.kind === Kind.OPERATION_DEFINITION && def.operation !== "subscription",
        );
        if (notSubscription) {
          return [new GraphQLError("Only subscriptions are supported over WebSocket; use HTTP for queries and mutations.")];
        }
        const errors = validate(schema, document, rules);
        if (errors.length > 0) return errors;
        return undefined;
      },
      onError: (_ctx, _id, _payload, errors) => {
        logger.warn({ codes: errors.map((e) => e.extensions?.code ?? "ERROR") }, "subscription error");
      },
    },
    wss,
    KEEP_ALIVE_MS,
  );

  return {
    wss,
    async close() {
      await cleanup.dispose();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
