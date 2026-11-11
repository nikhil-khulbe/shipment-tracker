import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import { createClient, type Client } from "graphql-ws";
import { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } from "./setup.js";
import { Shipment } from "../models/Shipment.js";
import { Admin } from "../models/Admin.js";
import { hashPassword, login } from "../services/authService.js";
import { config } from "../config.js";
import { schema } from "../executableSchema.js";
import { attachRealtime, MAX_SUBSCRIPTIONS_PER_CONNECTION } from "../realtime.js";
import { publishShipment } from "../pubsub.js";
import * as shipmentService from "../services/shipmentService.js";

let httpServer: Server;
let realtime: ReturnType<typeof attachRealtime>;
let url: string;
const clients: Client[] = [];

beforeAll(async () => {
  await connectTestDatabase();
  httpServer = createServer();
  realtime = attachRealtime(httpServer, schema);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  url = `ws://127.0.0.1:${(httpServer.address() as AddressInfo).port}/graphql`;
}, 60000);

afterAll(async () => {
  config.requireAdmin = false;
  await realtime.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await disconnectTestDatabase();
});

beforeEach(async () => {
  config.requireAdmin = true;
  await clearTestDatabase();
});

afterEach(async () => {
  while (clients.length) await clients.pop()!.dispose();
});

function connect(token?: string): Client {
  const client = createClient({
    url,
    webSocketImpl: WebSocket,
    retryAttempts: 0,
    connectionParams: token ? { authorization: `Bearer ${token}` } : {},
  });
  clients.push(client);
  return client;
}

async function tokenFor(role: "ADMIN" | "DRIVER") {
  const email = `${role.toLowerCase()}@example.com`;
  const admin = await Admin.create({ email, passwordHash: await hashPassword("pw"), role });
  return { id: admin._id.toString(), token: (await login(email, "pw")).token };
}

function makeShipment(trackingId = "SHP-LIVE0001") {
  return Shipment.create({
    trackingId,
    origin: "Delhi",
    destination: "Mumbai",
    receiverName: "Asha Rao",
    receiverPhone: "9876543210",
    deliveryOtp: "4821",
    createdBy: "admin@example.com",
    currentStatus: "PICKED_UP",
    history: [
      { status: "CREATED", location: "Delhi", by: "admin@example.com" },
      { status: "PICKED_UP", location: "Delhi" },
    ],
  });
}

const UPDATED = `subscription ($id: String!) {
  shipmentUpdated(trackingId: $id) { trackingId currentStatus receiverPhone deliveryOtp createdBy }
}`;
const FEED = `subscription { shipmentFeed { trackingId currentStatus deliveryOtp } }`;

/**
 * Waits for the first event, nudging the server until the subscription is live
 * (a subscribe message is processed asynchronously, so a single early publish
 * could be missed). Once an event arrives the subscription is registered, so
 * everything after that is deterministic.
 */
async function firstEvent<T>(iterator: AsyncIterableIterator<T>, nudge: () => void): Promise<IteratorResult<T>> {
  const timer = setInterval(nudge, 40);
  try {
    return await iterator.next();
  } finally {
    clearInterval(timer);
  }
}

describe("shipmentUpdated (public)", () => {
  test("anyone tracking a parcel sees changes live, with private fields masked", async () => {
    const doc = await makeShipment();
    const events = connect().iterate<any>({ query: UPDATED, variables: { id: "shp-live0001" } }); // case-insensitive
    const first = await firstEvent(events, () => publishShipment(doc));
    expect(first.value.data.shipmentUpdated).toEqual({
      trackingId: "SHP-LIVE0001",
      currentStatus: "PICKED_UP",
      receiverPhone: "••••••3210",
      deliveryOtp: null,
      createdBy: null,
    });

    // A real status change flows through the service and arrives.
    await shipmentService.updateStatus({ trackingId: "SHP-LIVE0001", status: "IN_TRANSIT", location: "Nagpur" }, "driver@example.com");
    let next = await events.next();
    while (next.value.data.shipmentUpdated.currentStatus === "PICKED_UP") next = await events.next(); // drain nudges
    expect(next.value.data.shipmentUpdated.currentStatus).toBe("IN_TRANSIT");
  });

  test("does not receive other shipments", async () => {
    const mine = await makeShipment("SHP-LIVE0001");
    const other = await makeShipment("SHP-LIVE0002");
    const events = connect().iterate<any>({ query: UPDATED, variables: { id: "SHP-LIVE0001" } });
    const first = await firstEvent(events, () => {
      publishShipment(other);
      publishShipment(mine);
    });
    expect(first.value.data.shipmentUpdated.trackingId).toBe("SHP-LIVE0001");
    publishShipment(other);
    publishShipment(mine);
    const second = await events.next();
    expect(second.value.data.shipmentUpdated.trackingId).toBe("SHP-LIVE0001");
  });

  test("a logged-in admin sees the unmasked phone", async () => {
    const { token } = await tokenFor("ADMIN");
    const doc = await makeShipment();
    const events = connect(token).iterate<any>({ query: UPDATED, variables: { id: "SHP-LIVE0001" } });
    const first = await firstEvent(events, () => publishShipment(doc));
    expect(first.value.data.shipmentUpdated.receiverPhone).toBe("9876543210");
    expect(first.value.data.shipmentUpdated.deliveryOtp).toBe("4821");
  });

  test("rejects an empty or oversized tracking ID", async () => {
    const events = connect().iterate<any>({ query: UPDATED, variables: { id: "x".repeat(41) } });
    const result = await events.next();
    expect(result.value.errors[0].message).toBe("Enter a valid tracking ID.");
  });
});

describe("shipmentFeed (staff)", () => {
  test("anonymous callers are refused when login is required", async () => {
    const events = connect().iterate<any>({ query: FEED });
    // A guard failure inside the resolver is delivered as an in-band error, then the stream ends.
    const result = await events.next();
    expect(result.value.errors[0].extensions.code).toBe("UNAUTHENTICATED");
    expect(result.value.data).toBeUndefined();
  });

  test("an ADMIN sees every shipment including the delivery code; a DRIVER does not", async () => {
    const admin = await tokenFor("ADMIN");
    const driver = await tokenFor("DRIVER");
    const doc = await makeShipment();
    const asAdmin = connect(admin.token).iterate<any>({ query: FEED });
    const asDriver = connect(driver.token).iterate<any>({ query: FEED });
    const [a, d] = await Promise.all([
      firstEvent(asAdmin, () => publishShipment(doc)),
      firstEvent(asDriver, () => publishShipment(doc)),
    ]);
    expect(a.value.data.shipmentFeed.deliveryOtp).toBe("4821");
    expect(d.value.data.shipmentFeed.deliveryOtp).toBeNull();
  });

  test("the stream ends when the account is deleted", async () => {
    const admin = await tokenFor("ADMIN");
    const doc = await makeShipment();
    const events = connect(admin.token).iterate<any>({ query: FEED });
    await firstEvent(events, () => publishShipment(doc));
    await Admin.deleteMany({});
    publishShipment(doc);
    // Any events queued before the deletion may still arrive; the stream must then complete.
    let result = await events.next();
    while (!result.done) result = await events.next();
    expect(result.done).toBe(true);
  });
});

describe("limits", () => {
  test("queries and mutations are not accepted over the socket", async () => {
    const rejected = [`query { authRequired }`, `mutation { login(email: "a@b.c", password: "x") { token } }`];
    for (const query of rejected) {
      const events = connect().iterate<any>({ query });
      await expect(events.next()).rejects.toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining("Only subscriptions") })]));
    }
  });

  test("a connection can't open more than the allowed number of subscriptions", async () => {
    const client = connect();
    const iterators = Array.from({ length: MAX_SUBSCRIPTIONS_PER_CONNECTION + 1 }, (_, i) =>
      client.iterate<any>({ query: UPDATED, variables: { id: `SHP-LIM${i}` } }),
    );
    // Only the last one is over the limit.
    await expect(iterators[MAX_SUBSCRIPTIONS_PER_CONNECTION]!.next()).rejects.toEqual(
      expect.arrayContaining([expect.objectContaining({ message: "Too many subscriptions on this connection." })]),
    );
  });

  test("too many connections from one IP are turned away", async () => {
    const previous = config.wsMaxConnectionsPerIp;
    config.wsMaxConnectionsPerIp = 2;
    try {
      const open = async () => {
        const socket = new WebSocket(url, "graphql-transport-ws");
        await new Promise<void>((resolve, reject) => {
          socket.once("open", resolve);
          socket.once("error", reject);
        });
        return socket;
      };
      const a = await open();
      const b = await open();
      await expect(open()).rejects.toThrow(/429/);
      a.close();
      b.close();
    } finally {
      config.wsMaxConnectionsPerIp = previous;
    }
  });
});
