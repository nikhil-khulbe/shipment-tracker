import type { GraphQLContext } from "../context.js";
import * as shipmentService from "../services/shipmentService.js";
import { requireAdmin, badUserInput } from "../errors.js";
import { isShipmentStatus } from "../domain/status.js";
import { Admin } from "../models/Admin.js";
import { config } from "../config.js";

/** Admin-only gate. A no-op when REQUIRE_ADMIN=false (open demo mode). */
async function guardAdmin(context: GraphQLContext): Promise<void> {
  if (config.requireAdmin) {
    await requireAdmin(context, Admin);
  }
}

/**
 * Mongoose gives back `_id` (an ObjectId) and Date objects; GraphQL's
 * schema promises `id: ID!` (a string) and ISO-8601 date strings. This
 * is the one place that translation happens, for both the lean query
 * result (plain object) and the hydrated document (updateStatus).
 */
function serializeShipment(doc: any) {
  return {
    id: doc._id.toString(),
    trackingId: doc.trackingId,
    origin: doc.origin,
    destination: doc.destination,
    receiverName: doc.receiverName,
    currentStatus: doc.currentStatus,
    history: doc.history.map((event: any) => ({
      status: event.status,
      location: event.location,
      note: event.note ?? null,
      timestamp: new Date(event.timestamp).toISOString(),
    })),
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

export const shipmentQueries = {
  authRequired: () => config.requireAdmin,

  shipment: async (_parent: unknown, args: { trackingId: string }) => {
    const doc = await shipmentService.findByTrackingId(args.trackingId);
    return doc ? serializeShipment(doc) : null;
  },

  shipments: async (
    _parent: unknown,
    args: shipmentService.ListShipmentsInput,
    context: GraphQLContext,
  ) => {
    await guardAdmin(context);
    const page = await shipmentService.listShipments(args);
    return { items: page.items.map(serializeShipment), nextCursor: page.nextCursor };
  },

  me: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
    const admin = await requireAdmin(context, Admin);
    return { id: admin.id, email: admin.email };
  },
};

export const shipmentMutations = {
  createShipment: async (
    _parent: unknown,
    args: { input: shipmentService.CreateShipmentInput },
    context: GraphQLContext,
  ) => {
    await guardAdmin(context);
    const doc = await shipmentService.createShipment(args.input);
    return serializeShipment(doc);
  },

  updateStatus: async (
    _parent: unknown,
    args: { input: { trackingId: string; status: string; location: string; note?: string | null } },
    context: GraphQLContext,
  ) => {
    await guardAdmin(context);
    if (!isShipmentStatus(args.input.status)) {
      throw badUserInput(`"${args.input.status}" is not a valid shipment status.`);
    }
    const doc = await shipmentService.updateStatus({
      trackingId: args.input.trackingId,
      status: args.input.status,
      location: args.input.location,
      note: args.input.note,
    });
    return serializeShipment(doc);
  },
};
