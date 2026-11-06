import type { FilterQuery } from "mongoose";
import { Shipment, type ShipmentDocument } from "../models/Shipment.js";
import { generateTrackingId } from "../domain/trackingId.js";
import { canTransition, lastRegularStatus, requiresReason, type ShipmentStatus } from "../domain/status.js";
import { parseEstimatedDelivery, type PackageType } from "../domain/shipmentDetails.js";
import { badUserInput, invalidStatusTransition, notFound } from "../errors.js";

const MAX_TRACKING_ID_ATTEMPTS = 3;

export type CreateShipmentInput = {
  origin: string;
  destination: string;
  receiverName: string;
  originLocation?: string | null;
  senderName?: string | null;
  receiverPhone?: string | null;
  packageType?: PackageType | null;
  weightKg?: number | null;
  description?: string | null;
  estimatedDelivery?: string | null;
};

export type UpdateStatusInput = {
  trackingId: string;
  status: ShipmentStatus;
  location: string;
  note?: string | null;
};

export function findByTrackingId(trackingId: string): Promise<ShipmentDocument | null> {
  return Shipment.findOne({ trackingId: trackingId.toUpperCase().trim() }).lean();
}

/**
 * Creates a shipment with a server-generated tracking ID and a seeded
 * CREATED history event. Retries on a tracking-ID collision (Mongo
 * E11000) rather than checking-then-inserting, which would race.
 */
export async function createShipment(input: CreateShipmentInput) {
  let estimatedDelivery: Date | undefined;
  if (input.estimatedDelivery) {
    const parsed = parseEstimatedDelivery(input.estimatedDelivery);
    if (!parsed) throw badUserInput("estimatedDelivery must be a valid date that is not in the past.");
    estimatedDelivery = parsed;
  }
  for (let attempt = 1; attempt <= MAX_TRACKING_ID_ATTEMPTS; attempt++) {
    const trackingId = generateTrackingId();
    try {
      return await Shipment.create({
        trackingId,
        origin: input.origin,
        destination: input.destination,
        receiverName: input.receiverName,
        // `|| undefined` so blank strings from a form aren't stored as "".
        senderName: input.senderName || undefined,
        receiverPhone: input.receiverPhone || undefined,
        packageType: input.packageType ?? undefined,
        weightKg: input.weightKg ?? undefined,
        description: input.description || undefined,
        estimatedDelivery,
        currentStatus: "CREATED",
        history: [
          {
            status: "CREATED",
            location: input.originLocation?.trim() || input.origin,
            timestamp: new Date(),
          },
        ],
      });
    } catch (err) {
      const isDuplicateKey = (err as { code?: number }).code === 11000;
      const isLastAttempt = attempt === MAX_TRACKING_ID_ATTEMPTS;
      if (!isDuplicateKey || isLastAttempt) {
        if ((err as { name?: string }).name === "ValidationError") {
          throw badUserInput((err as Error).message);
        }
        throw err;
      }
      // else: collision on the random suffix — loop and try a fresh one.
    }
  }
  // Unreachable: the loop always returns or throws.
  throw new Error("createShipment: exhausted retry attempts");
}

/**
 * Advances a shipment's status.
 *
 * Reads the current status to validate the transition, then applies the
 * write atomically with that same status repeated in the filter — a
 * compare-and-swap. If another request changed the status in between,
 * the filter matches nothing and we report an invalid transition instead
 * of silently appending a second, conflicting history event.
 */
export async function updateStatus(input: UpdateStatusInput) {
  const trackingId = input.trackingId.toUpperCase().trim();
  const current = await Shipment.findOne({ trackingId });
  if (!current) {
    throw notFound(`No shipment found for tracking ID "${trackingId}".`);
  }

  const lastRegular = lastRegularStatus(current.history);
  if (!canTransition(current.currentStatus as ShipmentStatus, input.status, lastRegular)) {
    throw invalidStatusTransition(
      `Cannot move a shipment from ${current.currentStatus} to ${input.status}.`,
    );
  }

  // A problem status without a reason is useless to the person tracking the parcel.
  if (requiresReason(input.status) && !input.note?.trim()) {
    throw badUserInput(`A note explaining the reason is required when setting ${input.status}.`);
  }

  const event = {
    status: input.status,
    location: input.location,
    note: input.note ?? undefined,
    timestamp: new Date(),
  };

  const updated = await Shipment.findOneAndUpdate(
    { trackingId, currentStatus: current.currentStatus },
    { $set: { currentStatus: input.status }, $push: { history: event } },
    { new: true, runValidators: true },
  );

  if (!updated) {
    // Someone else changed the status between our read and our write.
    throw invalidStatusTransition(
      `Shipment status changed before this update could be applied. Please retry.`,
    );
  }

  return updated;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export type ListShipmentsInput = {
  status?: ShipmentStatus | null;
  search?: string | null;
  cursor?: string | null;
  limit?: number | null;
};

type Cursor = { createdAt: Date; id: string };

/** Opaque to clients: base64url of {c: ISO createdAt, i: _id}. */
function encodeCursor(doc: { createdAt: Date; _id: { toString(): string } }): string {
  return Buffer.from(JSON.stringify({ c: doc.createdAt.toISOString(), i: doc._id.toString() })).toString(
    "base64url",
  );
}

function decodeCursor(raw: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { c?: unknown; i?: unknown };
    const createdAt = new Date(String(parsed.c));
    if (Number.isNaN(createdAt.getTime()) || typeof parsed.i !== "string" || !/^[0-9a-f]{24}$/i.test(parsed.i)) {
      throw new Error("bad cursor");
    }
    return { createdAt, id: parsed.i };
  } catch {
    throw badUserInput("Invalid cursor.");
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Newest-first page of shipments using keyset (cursor) pagination.
 *
 * Why not skip/limit: skip is O(skip) — Mongo walks and discards every
 * skipped row — and drifts when rows are inserted while an admin is
 * scrolling (a new shipment shifts everything down, duplicating the row at
 * the page boundary). A cursor says "give me what sorts strictly after this
 * exact (createdAt, _id)", which is index-backed and unaffected by inserts.
 *
 * We fetch limit + 1 rows: the extra row only tells us whether another page
 * exists, and is dropped from the result.
 */
export async function listShipments(input: ListShipmentsInput) {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const filter: FilterQuery<ShipmentDocument> = {};

  if (input.status) filter.currentStatus = input.status;

  const search = input.search?.trim().toUpperCase();
  // Anchored prefix, so Mongo can use the trackingId index. An unanchored
  // regex would scan the whole collection.
  if (search) filter.trackingId = { $regex: `^${escapeRegex(search)}` };

  if (input.cursor) {
    const { createdAt, id } = decodeCursor(input.cursor);
    filter.$or = [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: id } }];
  }

  const rows = await Shipment.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last as any) : null,
  };
}
