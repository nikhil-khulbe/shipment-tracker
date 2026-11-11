import { randomInt } from "node:crypto";
import type { FilterQuery } from "mongoose";
import { Shipment, type ShipmentDocument } from "../models/Shipment.js";
import { generateTrackingId } from "../domain/trackingId.js";
import { allowedNext, canTransition, lastRegularStatus, requiresReason, SHIPMENT_STATUSES, type ShipmentStatus } from "../domain/status.js";
import { parseEstimatedDelivery, type PackageType } from "../domain/shipmentDetails.js";
import { config } from "../config.js";
import { badUserInput, invalidStatusTransition, notFound } from "../errors.js";
import { notifyStatusChange } from "./notifier.js";

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
  /** Required when moving to DELIVERED: who received the parcel. */
  deliveredTo?: string | null;
  /** The receiver's 4-digit delivery code (checked when admin login is required). */
  otp?: string | null;
};

export function findByTrackingId(trackingId: string): Promise<ShipmentDocument | null> {
  return Shipment.findOne({ trackingId: trackingId.toUpperCase().trim() }).lean();
}

/**
 * Creates a shipment with a server-generated tracking ID and a seeded
 * CREATED history event. Retries on a tracking-ID collision (Mongo
 * E11000) rather than checking-then-inserting, which would race.
 */
export async function createShipment(input: CreateShipmentInput, actor?: string | null) {
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
        createdBy: actor || undefined,
        deliveryOtp: String(randomInt(1000, 10000)),
        currentStatus: "CREATED",
        history: [
          {
            status: "CREATED",
            location: input.originLocation?.trim() || input.origin,
            timestamp: new Date(),
            by: actor || undefined,
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
export async function updateStatus(input: UpdateStatusInput, actor?: string | null) {
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

  // Proof of delivery: record who received it, and (when logins are on) make
  // the courier enter the receiver's code so a parcel can't be marked
  // delivered by guesswork.
  let deliveredTo: string | undefined;
  if (input.status === "DELIVERED") {
    deliveredTo = input.deliveredTo?.trim() || undefined;
    if (!deliveredTo) {
      throw badUserInput("Enter the name of the person who received the shipment.");
    }
    if (config.requireAdmin && current.deliveryOtp && input.otp?.trim() !== current.deliveryOtp) {
      throw badUserInput("Incorrect delivery code.");
    }
  }

  const event = {
    status: input.status,
    location: input.location,
    note: input.note ?? undefined,
    timestamp: new Date(),
    by: actor || undefined,
  };

  const updated = await Shipment.findOneAndUpdate(
    { trackingId, currentStatus: current.currentStatus },
    { $set: { currentStatus: input.status, ...(deliveredTo ? { deliveredTo } : {}) }, $push: { history: event } },
    { new: true, runValidators: true },
  );

  if (!updated) {
    // Someone else changed the status between our read and our write.
    throw invalidStatusTransition(
      `Shipment status changed before this update could be applied. Please retry.`,
    );
  }

  // Fire-and-forget: the status change is already saved, and a slow or broken
  // webhook must never delay or fail it (notifyStatusChange never throws).
  void notifyStatusChange({
    trackingId: updated.trackingId,
    status: input.status,
    origin: updated.origin,
    destination: updated.destination,
    location: input.location,
    note: input.note,
    by: actor,
  });

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

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export type EditShipmentInput = {
  origin?: string | null;
  destination?: string | null;
  receiverName?: string | null;
  senderName?: string | null;
  receiverPhone?: string | null;
  packageType?: PackageType | null;
  weightKg?: number | null;
  description?: string | null;
  estimatedDelivery?: string | null;
};

const REQUIRED_FIELDS = ["origin", "destination", "receiverName"] as const;
const OPTIONAL_FIELDS = ["senderName", "receiverPhone", "packageType", "weightKg", "description", "estimatedDelivery"] as const;

function asText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Edits a shipment's details (never its tracking ID or status).
 *
 * A field that is absent is left alone; a field sent as null or "" is
 * cleared (only possible for the optional ones). Only fields whose value
 * actually changes are written, and each edit is logged with who made it.
 * Like updateStatus the write is a compare-and-swap on currentStatus, so an
 * edit can't sneak in after the shipment was delivered.
 */
export async function editShipment(trackingIdRaw: string, input: EditShipmentInput, actor?: string | null) {
  const trackingId = trackingIdRaw.toUpperCase().trim();
  const current = await Shipment.findOne({ trackingId });
  if (!current) throw notFound(`No shipment found for tracking ID "${trackingId}".`);

  const history = current.history as unknown as { status: string }[];
  if (allowedNext(current.currentStatus as ShipmentStatus, lastRegularStatus(history)).length === 0) {
    throw badUserInput(`A ${current.currentStatus.toLowerCase().replace(/_/g, " ")} shipment can't be edited.`);
  }

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  const changes: { field: string; from?: string; to?: string }[] = [];
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);

  for (const field of REQUIRED_FIELDS) {
    if (!has(field)) continue;
    const next = String(input[field] ?? "").trim();
    if (!next) throw badUserInput(`${field} can't be empty.`);
    const before = asText(current.get(field));
    if (next !== before) {
      $set[field] = next;
      changes.push({ field, from: before, to: next });
    }
  }

  for (const field of OPTIONAL_FIELDS) {
    if (!has(field)) continue;
    const raw = input[field];
    const before = asText(current.get(field));
    const clearing = raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "");
    if (clearing) {
      if (before !== undefined) {
        $unset[field] = 1;
        changes.push({ field, from: before });
      }
      continue;
    }
    let value: unknown = typeof raw === "string" ? raw.trim() : raw;
    if (field === "estimatedDelivery") {
      const parsed = parseEstimatedDelivery(String(raw));
      if (!parsed) throw badUserInput("estimatedDelivery must be a valid date that is not in the past.");
      value = parsed;
    }
    const after = asText(value);
    if (after !== before) {
      $set[field] = value;
      changes.push({ field, from: before, to: after });
    }
  }

  if (changes.length === 0) return current; // nothing actually changed

  try {
    const updated = await Shipment.findOneAndUpdate(
      { trackingId, currentStatus: current.currentStatus },
      {
        ...(Object.keys($set).length ? { $set } : {}),
        ...(Object.keys($unset).length ? { $unset } : {}),
        $push: { edits: { at: new Date(), by: actor || undefined, changes } },
      },
      { new: true, runValidators: true },
    );
    if (!updated) {
      throw invalidStatusTransition("The shipment changed while you were editing it. Please reload and try again.");
    }
    return updated;
  } catch (err) {
    if ((err as { name?: string }).name === "ValidationError") throw badUserInput((err as Error).message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

export const MAX_BULK = 50;
export const MAX_IMPORT = 200;

export type BulkStatusResult = { trackingId: string; ok: boolean; error: string | null; status: ShipmentStatus | null };

/**
 * Moves many shipments to the same status. Each is attempted independently
 * (one illegal move doesn't block the rest) and every outcome is reported.
 * DELIVERED is excluded: it needs a recipient name and code per parcel.
 */
export async function bulkUpdateStatus(
  trackingIds: string[],
  status: ShipmentStatus,
  location: string,
  note: string | null | undefined,
  actor?: string | null,
): Promise<BulkStatusResult[]> {
  if (trackingIds.length === 0) throw badUserInput("Select at least one shipment.");
  if (trackingIds.length > MAX_BULK) throw badUserInput(`You can update at most ${MAX_BULK} shipments at once.`);
  if (status === "DELIVERED") {
    throw badUserInput("Delivery needs a recipient name and code for each parcel; mark those one at a time.");
  }

  const unique = [...new Set(trackingIds.map((id) => id.toUpperCase().trim()).filter(Boolean))];
  const results: BulkStatusResult[] = [];
  for (const trackingId of unique) {
    try {
      const updated = await updateStatus({ trackingId, status, location, note }, actor);
      results.push({ trackingId, ok: true, error: null, status: updated.currentStatus as ShipmentStatus });
    } catch (err) {
      results.push({ trackingId, ok: false, error: (err as Error).message, status: null });
    }
  }
  return results;
}

export type ImportResult = { row: number; ok: boolean; error: string | null; trackingId: string | null };

/** Creates many shipments (e.g. from a CSV); a bad row is reported, not fatal. */
export async function importShipments(inputs: CreateShipmentInput[], actor?: string | null): Promise<ImportResult[]> {
  if (inputs.length === 0) throw badUserInput("Nothing to import.");
  if (inputs.length > MAX_IMPORT) throw badUserInput(`You can import at most ${MAX_IMPORT} shipments at once.`);
  const results: ImportResult[] = [];
  for (const [index, input] of inputs.entries()) {
    try {
      const created = await createShipment(input, actor);
      results.push({ row: index + 1, ok: true, error: null, trackingId: created.trackingId });
    } catch (err) {
      results.push({ row: index + 1, ok: false, error: (err as Error).message, trackingId: null });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const FINAL_STATUSES: ShipmentStatus[] = ["DELIVERED", "RETURNED", "CANCELLED"];

/**
 * Numbers for the admin dashboard. "Per day" is by UTC calendar day for the
 * last 7 days (zero-filled). "Stuck" is any unfinished shipment untouched
 * for `stuckAfterHours`, oldest first.
 */
export async function dashboardStats(stuckAfterHours = 72, now: Date = new Date()) {
  const hours = Math.min(Math.max(stuckAfterHours, 1), 24 * 30);
  const cutoff = new Date(now.getTime() - hours * 3600_000);
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));

  const [total, byStatusRaw, perDayRaw, overdueCount, stuck] = await Promise.all([
    Shipment.countDocuments(),
    Shipment.aggregate<{ _id: ShipmentStatus; count: number }>([{ $group: { _id: "$currentStatus", count: { $sum: 1 } } }]),
    Shipment.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: dayStart } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } }, count: { $sum: 1 } } },
    ]),
    Shipment.countDocuments({ currentStatus: { $nin: FINAL_STATUSES }, estimatedDelivery: { $lt: now } }),
    Shipment.find({ currentStatus: { $nin: FINAL_STATUSES }, updatedAt: { $lt: cutoff } })
      .sort({ updatedAt: 1 })
      .limit(10)
      .lean(),
  ]);

  const counts = new Map(byStatusRaw.map((row) => [row._id, row.count]));
  const perDay = new Map(perDayRaw.map((row) => [row._id, row.count]));
  const createdPerDay = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(dayStart.getTime() + i * 86400_000).toISOString().slice(0, 10);
    return { date, count: perDay.get(date) ?? 0 };
  });

  return {
    total,
    byStatus: SHIPMENT_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 })),
    createdPerDay,
    overdueCount,
    stuck,
  };
}
