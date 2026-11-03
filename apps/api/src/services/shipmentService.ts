import { Shipment, type ShipmentDocument } from "../models/Shipment.js";
import { generateTrackingId } from "../domain/trackingId.js";
import { canTransition, type ShipmentStatus } from "../domain/status.js";
import { badUserInput, invalidStatusTransition, notFound } from "../errors.js";

const MAX_TRACKING_ID_ATTEMPTS = 3;

export type CreateShipmentInput = {
  origin: string;
  destination: string;
  receiverName: string;
  originLocation?: string | null;
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
  for (let attempt = 1; attempt <= MAX_TRACKING_ID_ATTEMPTS; attempt++) {
    const trackingId = generateTrackingId();
    try {
      return await Shipment.create({
        trackingId,
        origin: input.origin,
        destination: input.destination,
        receiverName: input.receiverName,
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

  if (!canTransition(current.currentStatus as ShipmentStatus, input.status)) {
    throw invalidStatusTransition(
      `Cannot move a shipment from ${current.currentStatus} to ${input.status}.`,
    );
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
