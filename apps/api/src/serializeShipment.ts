import { allowedNext, lastRegularStatus } from "./domain/status.js";

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
