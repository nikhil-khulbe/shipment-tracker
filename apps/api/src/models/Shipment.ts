import { Schema, model, type InferSchemaType } from "mongoose";
import { SHIPMENT_STATUSES } from "../domain/status.js";

const statusEventSchema = new Schema(
  {
    status: {
      type: String,
      enum: SHIPMENT_STATUSES,
      required: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: false },
);

const shipmentSchema = new Schema(
  {
    trackingId: {
      type: String,
      required: true,
      uppercase: true,
      immutable: true,
    },
    origin: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    destination: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    receiverName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    currentStatus: {
      type: String,
      enum: SHIPMENT_STATUSES,
      required: true,
      default: "CREATED",
    },
    history: {
      type: [statusEventSchema],
      required: true,
      validate: {
        validator: (events: unknown[]) => events.length >= 1,
        message: "history must contain at least one event",
      },
    },
  },
  { timestamps: true },
);

// The index that matters: public lookups go by trackingId, and it must
// be unique. Declared via .index() (not `unique: true` inline) so every
// index on this collection is visible in one place.
shipmentSchema.index({ trackingId: 1 }, { unique: true });

export type ShipmentDocument = InferSchemaType<typeof shipmentSchema>;

export const Shipment = model("Shipment", shipmentSchema);
