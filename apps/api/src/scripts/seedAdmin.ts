import mongoose from "mongoose";
import { config } from "../config.js";
import { Admin } from "../models/Admin.js";
import { hashPassword } from "../services/authService.js";

/**
 * Creates (or updates) the ADMIN account from SEED_ADMIN_EMAIL /
 * SEED_ADMIN_PASSWORD, and optionally a DRIVER account (can list shipments
 * and update their status, nothing else) from SEED_DRIVER_EMAIL /
 * SEED_DRIVER_PASSWORD. Upserts, so re-running is safe — useful for
 * resetting a demo password without touching the database by hand.
 *
 * Usage: npm run seed -w api   (reads apps/api/.env via dotenv)
 */
async function upsertAccount(email: string, password: string, role: "ADMIN" | "DRIVER") {
  const passwordHash = await hashPassword(password);
  await Admin.findOneAndUpdate(
    { email: email.toLowerCase().trim() },
    { $set: { passwordHash, role } },
    { upsert: true, new: true },
  );
}

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

  await upsertAccount(email, password, "ADMIN");
  console.log(`Seeded admin: ${email}`);

  const driverEmail = process.env.SEED_DRIVER_EMAIL;
  const driverPassword = process.env.SEED_DRIVER_PASSWORD;
  if (driverEmail && driverPassword) {
    await upsertAccount(driverEmail, driverPassword, "DRIVER");
    console.log(`Seeded driver: ${driverEmail}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
