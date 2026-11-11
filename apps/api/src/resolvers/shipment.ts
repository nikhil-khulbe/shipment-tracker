import type { GraphQLContext } from "../context.js";
import * as shipmentService from "../services/shipmentService.js";
import { currentRole, requireAdmin, badUserInput, type Role } from "../errors.js";
import { isShipmentStatus } from "../domain/status.js";
import { maskPhone } from "../domain/shipmentDetails.js";
import { serializeShipment } from "../serializeShipment.js";
import { pubsub, SHIPMENT_FEED, shipmentTopic, type ShipmentEvent } from "../pubsub.js";
import { liveEvents } from "../subscriptionGuards.js";
import { config } from "../config.js";

const ANY_STAFF: readonly Role[] = ["ADMIN", "DRIVER"];
const ADMIN_ONLY: readonly Role[] = ["ADMIN"];

/**
 * Admin-only gate. In open demo mode (REQUIRE_ADMIN=false) it lets everyone
 * through and returns null; otherwise it returns the caller's email so the
 * service can record who made the change.
 */
async function guard(context: GraphQLContext, roles: readonly Role[]): Promise<string | null> {
  if (!config.requireAdmin) return null;
  const admin = await requireAdmin(context, roles);
  return admin.email;
}

/** Field-level resolvers for the Shipment type: who may see what. */
export const shipmentFields = {
  receiverPhone: (parent: { receiverPhone: string | null }, _args: unknown, context: GraphQLContext) =>
    context.admin ? parent.receiverPhone : maskPhone(parent.receiverPhone),

  // A DRIVER must not see the code, or it protects nothing.
  deliveryOtp: async (parent: { deliveryOtp: string | null }, _args: unknown, context: GraphQLContext) =>
    (await currentRole(context)) === "ADMIN" ? parent.deliveryOtp : null,

  createdBy: async (parent: { createdBy: string | null }, _args: unknown, context: GraphQLContext) =>
    (await currentRole(context)) ? parent.createdBy : null,

  edits: async (parent: { edits: unknown[] }, _args: unknown, context: GraphQLContext) =>
    (await currentRole(context)) ? parent.edits : [],
};

export const statusEventFields = {
  updatedBy: async (parent: { updatedBy: string | null }, _args: unknown, context: GraphQLContext) =>
    (await currentRole(context)) ? parent.updatedBy : null,
};

export const shipmentQueries = {
  authRequired: () => config.requireAdmin,

  shipment: async (_parent: unknown, args: { trackingId: string }) => {
    const doc = await shipmentService.findByTrackingId(args.trackingId);
    return doc ? serializeShipment(doc) : null;
  },

  shipments: async (_parent: unknown, args: shipmentService.ListShipmentsInput, context: GraphQLContext) => {
    await guard(context, ANY_STAFF);
    const page = await shipmentService.listShipments(args);
    return { items: page.items.map(serializeShipment), nextCursor: page.nextCursor };
  },

  dashboardStats: async (_parent: unknown, args: { stuckAfterHours?: number | null }, context: GraphQLContext) => {
    await guard(context, ADMIN_ONLY);
    const stats = await shipmentService.dashboardStats(args.stuckAfterHours ?? 72);
    return { ...stats, stuck: stats.stuck.map(serializeShipment) };
  },

  auditExport: async (_parent: unknown, args: { from?: string | null; to?: string | null }, context: GraphQLContext) => {
    await guard(context, ADMIN_ONLY);
    return shipmentService.auditExport(args);
  },

  me: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
    const admin = await requireAdmin(context);
    return { id: admin.id, email: admin.email, role: admin.role };
  },
};

export const shipmentMutations = {
  createShipment: async (
    _parent: unknown,
    args: { input: shipmentService.CreateShipmentInput },
    context: GraphQLContext,
  ) => {
    const actor = await guard(context, ADMIN_ONLY);
    const doc = await shipmentService.createShipment(args.input, actor);
    return serializeShipment(doc);
  },

  updateStatus: async (
    _parent: unknown,
    args: { input: shipmentService.UpdateStatusInput & { status: string } },
    context: GraphQLContext,
  ) => {
    const actor = await guard(context, ANY_STAFF);
    if (!isShipmentStatus(args.input.status)) {
      throw badUserInput(`"${args.input.status}" is not a valid shipment status.`);
    }
    const doc = await shipmentService.updateStatus({ ...args.input, status: args.input.status }, actor);
    return serializeShipment(doc);
  },

  editShipment: async (
    _parent: unknown,
    args: { trackingId: string; input: shipmentService.EditShipmentInput },
    context: GraphQLContext,
  ) => {
    const actor = await guard(context, ADMIN_ONLY);
    const doc = await shipmentService.editShipment(args.trackingId, args.input, actor);
    return serializeShipment(doc);
  },

  bulkUpdateStatus: async (
    _parent: unknown,
    args: { trackingIds: string[]; status: string; location: string; note?: string | null },
    context: GraphQLContext,
  ) => {
    const actor = await guard(context, ANY_STAFF);
    if (!isShipmentStatus(args.status)) {
      throw badUserInput(`"${args.status}" is not a valid shipment status.`);
    }
    return shipmentService.bulkUpdateStatus(args.trackingIds, args.status, args.location, args.note, actor);
  },

  importShipments: async (
    _parent: unknown,
    args: { inputs: shipmentService.CreateShipmentInput[] },
    context: GraphQLContext,
  ) => {
    const actor = await guard(context, ADMIN_ONLY);
    return shipmentService.importShipments(args.inputs, actor);
  },
};

const MAX_TRACKING_ID_LENGTH = 40;

export const shipmentSubscriptions = {
  /** Public, like the `shipment` query: live changes to one shipment. */
  shipmentUpdated: {
    subscribe: (_parent: unknown, args: { trackingId: string }, context: GraphQLContext) => {
      const trackingId = args.trackingId.trim();
      if (!trackingId || trackingId.length > MAX_TRACKING_ID_LENGTH) throw badUserInput("Enter a valid tracking ID.");
      return liveEvents(context, pubsub.asyncIterableIterator<ShipmentEvent>(shipmentTopic(trackingId)), { staffOnly: false });
    },
    resolve: (event: ShipmentEvent) => event.shipment,
  },

  /** Staff only: every shipment change, so lists and the dashboard can refresh. */
  shipmentFeed: {
    subscribe: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      await guard(context, ANY_STAFF);
      return liveEvents(context, pubsub.asyncIterableIterator<ShipmentEvent>(SHIPMENT_FEED), { staffOnly: true });
    },
    resolve: (event: ShipmentEvent) => event.shipment,
  },
};
