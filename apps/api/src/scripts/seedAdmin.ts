import mongoose from "mongoose";
import { config } from "../config.js";
import { Admin } from "../models/Admin.js";
import { hashPassword } from "../services/authService.js";

/**
 * Creates (or updates) the single admin account from SEED_ADMIN_EMAIL /
 * SEED_ADMIN_PASSWORD. Upserts, so re-running is safe — useful for
 * resetting the demo password without touching the database by hand.
 *
 * Usage: npm run seed -w api   (reads apps/api/.env via dotenv)
 */
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      "Refusing to seed: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (see .env.example).",
    );
    process.exit(1);
  }

  await mongoose.connect(config.mongodbUri);
  await Admin.syncIndexes();

  const passwordHash = await hashPassword(password);
  await Admin.findOneAndUpdate(
    { email: email.toLowerCase().trim() },
    { $set: { passwordHash } },
    { upsert: true, new: true },
  );

  console.log(`Seeded admin: ${email}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
