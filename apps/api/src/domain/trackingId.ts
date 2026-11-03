/**
 * Generates a public-facing tracking ID, e.g. "SHP-7K2M9QXZ".
 *
 * Server-generated (never supplied by the admin) so the format is
 * guaranteed and collisions stay the caller's problem to retry, not
 * the admin's problem to avoid.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I — avoids transcription mistakes
const SUFFIX_LENGTH = 8;

export function generateTrackingId(): string {
  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `SHP-${suffix}`;
}
