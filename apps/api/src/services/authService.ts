import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Admin } from "../models/Admin.js";
import { config } from "../config.js";
import { unauthenticated } from "../errors.js";

const BCRYPT_COST = 10;

export type JwtPayload = {
  sub: string;
  email: string;
};

export type AuthResult = {
  token: string;
  email: string;
  expiresIn: number;
};

const DURATION_MULTIPLIERS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/**
 * Parses simple "8h" / "30m" / "3600s" / "2d" durations into seconds.
 * Falls back to 1 hour for anything it doesn't recognise, rather than
 * throwing on a malformed env var.
 */
function durationToSeconds(duration: string): number {
  const match = /^(\d+)(s|m|h|d)?$/.exec(duration.trim());
  if (!match) return 3600;
  const amount = Number(match[1] ?? "0");
  const unit = match[2] ?? "s";
  const multiplier = DURATION_MULTIPLIERS[unit] ?? 1;
  return amount * multiplier;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Verifies credentials and returns a signed JWT.
 *
 * Deliberately returns the SAME error (and message) for "no such email"
 * and "wrong password" — distinguishing them would let a caller enumerate
 * which emails have admin accounts.
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  const admin = await Admin.findOne({ email: email.toLowerCase().trim() }).select("+passwordHash");
  if (!admin) {
    throw unauthenticated("Incorrect email or password.");
  }

  const matches = await bcrypt.compare(password, admin.passwordHash);
  if (!matches) {
    throw unauthenticated("Incorrect email or password.");
  }

  const payload: JwtPayload = { sub: admin._id.toString(), email: admin.email };
  const expiresInSeconds = durationToSeconds(config.jwtExpiresIn);
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: expiresInSeconds });

  return {
    token,
    email: admin.email,
    expiresIn: expiresInSeconds,
  };
}

/** Returns the decoded payload, or null for a missing/invalid/expired token. Never throws. */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}
