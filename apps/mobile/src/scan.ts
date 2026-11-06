/**
 * Pulls a tracking ID out of whatever a scanner read: a bare ID ("SHP-7K2M9QXZ"),
 * or the tracking link we print in the QR code
 * ("https://.../track/SHP-7K2M9QXZ", "shipmenttracker://track/SHP-7K2M9QXZ").
 * The alphabet excludes 0/O/1/I, matching the API's generator, so a scan of
 * unrelated text isn't mistaken for an ID.
 */
const TRACKING_ID = /SHP-[A-HJ-NP-Z2-9]{8}/i;

export function extractTrackingId(text: string): string | null {
  const match = TRACKING_ID.exec(decodeURIComponentSafe(text));
  return match ? match[0].toUpperCase() : null;
}

function decodeURIComponentSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
