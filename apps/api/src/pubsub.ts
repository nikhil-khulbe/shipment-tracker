import { PubSub, type PubSubEngine } from "graphql-subscriptions";
import { logger } from "./logger.js";
import { serializeShipment } from "./serializeShipment.js";

/**
 * In-process event bus behind the GraphQL subscriptions. Swapping this one
 * object for a Redis-backed engine (same PubSubEngine interface) is all it
 * takes to fan events out across several API instances.
 */
export let pubsub: PubSubEngine = new PubSub();

export function setPubSub(engine: PubSubEngine): void {
  pubsub = engine;
}

/** Every change, for staff dashboards. */
export const SHIPMENT_FEED = "SHIPMENT_FEED";

/** Changes to one shipment, for whoever is tracking it. */
export const shipmentTopic = (trackingId: string): string => `SHIPMENT:${trackingId.toUpperCase().trim()}`;

export type ShipmentEvent = { shipment: ReturnType<typeof serializeShipment> };

/**
 * Announces that a shipment was created or changed. Called after the database
 * write succeeded and never throws: a broken event bus must not fail an update.
 * The payload is the raw serialised shipment; each subscriber's field resolvers
 * mask what that subscriber may not see (phone, delivery code, staff names).
 */
export function publishShipment(doc: unknown): void {
  try {
    const shipment = serializeShipment(doc);
    const event: ShipmentEvent = { shipment };
    void Promise.all([pubsub.publish(SHIPMENT_FEED, event), pubsub.publish(shipmentTopic(shipment.trackingId), event)]).catch(
      (err) => logger.warn({ err: (err as Error).name }, "could not publish shipment event"),
    );
  } catch (err) {
    logger.warn({ err: (err as Error).name }, "could not publish shipment event");
  }
}
