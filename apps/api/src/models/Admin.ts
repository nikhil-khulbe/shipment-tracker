import { Schema, model, type InferSchemaType } from "mongoose";

const adminSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
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
