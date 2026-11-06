import { Schema, model, type InferSchemaType } from "mongoose";
import { SHIPMENT_STATUSES } from "../domain/status.js";
import { PACKAGE_TYPES } from "../domain/shipmentDetails.js";

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
    // Who made this change (admin email). Null in open demo mode.
    by: { type: String, trim: true },
  },
  { _id: false },
);

// A record of one edit to the shipment's details (not its status).
const editSchema = new Schema(
  {
    at: { type: Date, required: true, default: Date.now },
    by: { type: String, trim: true },
    changes: [
      new Schema(
        { field: { type: String, required: true }, from: { type: String }, to: { type: String } },
        { _id: false },
      ),
    ],
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
    // Optional details. All optional so shipments created before these
    // existed stay valid without a migration.
    senderName: { type: String, trim: true, maxlength: 80 },
    receiverPhone: { type: String, trim: true, match: /^[+0-9][0-9 ()-]{5,18}$/ },
    packageType: { type: String, enum: PACKAGE_TYPES },
    weightKg: { type: Number, min: 0.01, max: 1000 },
    description: { type: String, trim: true, maxlength: 200 },
    estimatedDelivery: { type: Date },
    createdBy: { type: String, trim: true },
    // 4-digit code the receiver gives the courier. Only enforced when
    // admin login is required (see updateStatus).
    deliveryOtp: { type: String, match: /^\d{4}$/ },
    deliveredTo: { type: String, trim: true, maxlength: 80 },
    edits: { type: [editSchema], default: [] },
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

// Admin list: newest first. `_id` is the tie-breaker so the sort key is
// unique even when two shipments share a createdAt millisecond — which is
// what makes cursor pagination stable (see listShipments).
shipmentSchema.index({ createdAt: -1, _id: -1 });
// Same ordering, narrowed by status, for the filter chips.
shipmentSchema.index({ currentStatus: 1, createdAt: -1, _id: -1 });

export type ShipmentDocument = InferSchemaType<typeof shipmentSchema>;

export const Shipment = model("Shipment", shipmentSchema);
