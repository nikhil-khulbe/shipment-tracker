import { Schema, model, type InferSchemaType } from "mongoose";

const adminSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    // ADMIN can do everything; DRIVER can only list shipments and update their
    // status. Existing admin rows have no role, which Mongoose reads as ADMIN.
    role: {
      type: String,
      enum: ["ADMIN", "DRIVER"],
      default: "ADMIN",
    },
    // select: false keeps the hash out of every query result unless a
    // resolver explicitly asks for it with .select("+passwordHash") —
    // see authService.login for the one place that does.
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
  },
  { timestamps: true },
);

adminSchema.index({ email: 1 }, { unique: true });

export type AdminDocument = InferSchemaType<typeof adminSchema>;

export const Admin = model("Admin", adminSchema);
