import type { GraphQLContext } from "../context.js";
import * as shipmentService from "../services/shipmentService.js";
import { currentRole, requireAdmin, badUserInput, type Role } from "../errors.js";
import { allowedNext, isShipmentStatus, lastRegularStatus } from "../domain/status.js";
import { maskPhone } from "../domain/shipmentDetails.js";
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

/**
 * Mongoose gives back `_id` (an ObjectId) and Date objects; GraphQL's
 * schema promises `id: ID!` (a string) and ISO-8601 date strings. This
 * is the one place that translation happens, for both the lean query
 * result (plain object) and the hydrated document (updateStatus).
 *
 * Sensitive fields are serialised raw here and masked by the field
 * resolvers in `shipmentFields` below, which can see who is asking.
 */
export function serializeShipment(doc: any) {
  return {
    id: doc._id.toString(),
    trackingId: doc.trackingId,
    origin: doc.origin,
    destination: doc.destination,
    receiverName: doc.receiverName,
    senderName: doc.senderName ?? null,
    receiverPhone: doc.receiverPhone ?? null, // masked by Shipment.receiverPhone below
    packageType: doc.packageType ?? null,
    weightKg: doc.weightKg ?? null,
    description: doc.description ?? null,
    estimatedDelivery: doc.estimatedDelivery ? new Date(doc.estimatedDelivery).toISOString() : null,
    deliveredTo: doc.deliveredTo ?? null,
    deliveryOtp: doc.deliveryOtp ?? null, // ADMIN-only, see below
    createdBy: doc.createdBy ?? null, // staff-only, see below
    edits: (doc.edits ?? []).map((edit: any) => ({
      at: new Date(edit.at).toISOString(),
      by: edit.by ?? null,
      changes: (edit.changes ?? []).map((c: any) => ({ field: c.field, from: c.from ?? null, to: c.to ?? null })),
    })),
    currentStatus: doc.currentStatus,
    allowedNextStatuses: allowedNext(doc.currentStatus, lastRegularStatus(doc.history)),
    history: doc.history.map((event: any) => ({
      status: event.status,
      location: event.location,
      note: event.note ?? null,
      timestamp: new Date(event.timestamp).toISOString(),
      updatedBy: event.by ?? null, // staff-only, see below
    })),
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
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
