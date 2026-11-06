/**
 * English is the source of truth: `MessageKey` is derived from this object,
 * and hi.ts is typed against it, so a key missing from Hindi fails the
 * typecheck. `{name}` placeholders are filled in by `translate`.
 */
export const en = {
  "lang.switchTo": "हिन्दी",
  "lang.switchLabel": "Switch language to Hindi",

  "tab.track": "Track",
  "tab.admin": "Admin",

  "track.title": "Track a shipment",
  "track.subtitle": "Enter the tracking ID from your receipt.",
  "track.inputLabel": "Tracking ID",
  "track.placeholder": "e.g. SHP-7K2M9QXZ",
  "track.button": "Track",
  "track.searchAgain": "Track {id} again",
  "track.error": "Something went wrong reaching the server. Pull down to retry.",
  "track.notFound": "No shipment found for that tracking ID.",
  "track.updatedNow": "Updated just now",
  "track.updatedSeconds": "Updated {n}s ago",
  "track.updatedMinutes": "Updated {n}m ago",
  "track.save": "Save",
  "track.saved": "Saved",
  "track.saveLabel": "Save to my shipments",
  "track.unsaveLabel": "Remove from my shipments",
  "track.route": "Route",
  "track.routeLabel": "Show the route on a map",
  "track.share": "Share",
  "track.shareLabel": "Share the tracking link",
  "track.shareMessage": "Track shipment {id}: {url}",
  "track.linkCopied": "Tracking link copied",
  "track.mapsError": "Couldn't open maps",

  "saved.heading": "My shipments",
  "saved.open": "Open {id}",
  "saved.openRoute": "Open {id}, {origin} to {destination}",
  "saved.remove": "Remove {id} from my shipments",
  "saved.gone": "No longer found",
  "saved.loading": "Loading…",

  "header.receiver": "Receiver: {name}",
  "header.from": "From {name}",
  "header.weight": "{kg} kg",
  "header.progress": "Delivery progress",

  "package.DOCUMENT": "Document",
  "package.PARCEL": "Parcel",
  "package.FRAGILE": "Fragile",
  "package.ELECTRONICS": "Electronics",
  "package.OTHER": "Other",

  "status.CREATED": "Created",
  "status.PICKED_UP": "Picked Up",
  "status.IN_TRANSIT": "In Transit",
  "status.OUT_FOR_DELIVERY": "Out for Delivery",
  "status.DELIVERED": "Delivered",
  "status.DELAYED": "Delayed",
  "status.ON_HOLD": "On Hold",
  "status.DELIVERY_ATTEMPT_FAILED": "Delivery Failed",
  "status.RETURNED": "Returned",
  "status.CANCELLED": "Cancelled",

  "eta.delivered": "Delivered on {date}",
  "eta.returned": "Returned to sender{reason}",
  "eta.cancelled": "Cancelled{reason}",
  "eta.onHold": "On hold{reason}",
  "eta.delayed": "Delayed{reason}",
  "eta.attemptFailed": "Delivery attempt failed{reason}",
  "eta.late": "Was expected by {date}, running late",
  "eta.today": "Arriving today",
  "eta.tomorrow": "Arriving tomorrow",
  "eta.by": "Arriving by {date}",

  "offline.banner": "You're offline — showing saved data",
} as const satisfies Record<string, string>;

export type MessageKey = keyof typeof en;
