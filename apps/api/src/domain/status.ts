/**
 * The shipment status state machine.
 *
 * This is deliberately a plain, framework-free module: no Mongo, no
 * GraphQL. That's what makes the rules trivial to unit test and safe to
 * reuse from a resolver, a script, or a future REST endpoint.
 *
 * Shape: a main path of five REGULAR statuses, plus EXCEPTION statuses a
 * shipment can drop into along the way. Some exceptions are terminal
 * (RETURNED, CANCELLED); the others (DELAYED, ON_HOLD,
 * DELIVERY_ATTEMPT_FAILED) are recoverable, and "recovering" means going
 * back to the main path from wherever the shipment was. That is why the
 * rules need `lastRegular`: the last main-path status in its history.
 */

export const REGULAR_STATUSES = [
  "CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

export const EXCEPTION_STATUSES = [
  "DELAYED",
  "ON_HOLD",
  "DELIVERY_ATTEMPT_FAILED",
  "RETURNED",
  "CANCELLED",
] as const;

export const SHIPMENT_STATUSES = [...REGULAR_STATUSES, ...EXCEPTION_STATUSES] as const;

export type RegularStatus = (typeof REGULAR_STATUSES)[number];
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export function isShipmentStatus(value: string): value is ShipmentStatus {
  return (SHIPMENT_STATUSES as readonly string[]).includes(value);
}

export function isRegularStatus(status: ShipmentStatus): status is RegularStatus {
  return (REGULAR_STATUSES as readonly string[]).includes(status);
}

export function isExceptionStatus(status: ShipmentStatus): status is ExceptionStatus {
  return !isRegularStatus(status);
}

/** Moving into an exception status must come with a reason. */
export function requiresReason(status: ShipmentStatus): boolean {
  return isExceptionStatus(status);
}

/** The last main-path status in a history (CREATED if somehow none). */
export function lastRegularStatus(history: readonly { status: string }[]): RegularStatus {
  for (let i = history.length - 1; i >= 0; i--) {
    const status = history[i]!.status;
    if (isShipmentStatus(status) && isRegularStatus(status)) return status;
  }
  return "CREATED";
}

/** Where a recoverable exception can go back to: the status it came from, or the next one. */
function resumeTargets(lastRegular: RegularStatus): ShipmentStatus[] {
  const index = REGULAR_STATUSES.indexOf(lastRegular);
  const next = REGULAR_STATUSES[index + 1];
  return next ? [lastRegular, next] : [lastRegular];
}

/**
 * Every status this shipment may move to next.
 *
 * `lastRegular` only matters while the shipment is in an exception status;
 * for a main-path status the shipment IS its own last regular status.
 */
export function allowedNext(current: ShipmentStatus, lastRegular: RegularStatus): ShipmentStatus[] {
  switch (current) {
    case "CREATED":
      return ["PICKED_UP", "ON_HOLD", "CANCELLED"];
    case "PICKED_UP":
      return ["IN_TRANSIT", "DELAYED", "ON_HOLD", "CANCELLED"];
    case "IN_TRANSIT":
      return ["OUT_FOR_DELIVERY", "DELAYED", "ON_HOLD"];
    case "OUT_FOR_DELIVERY":
      return ["DELIVERED", "DELIVERY_ATTEMPT_FAILED", "DELAYED", "ON_HOLD"];
    case "DELAYED":
      return [...resumeTargets(lastRegular), "ON_HOLD", "RETURNED"];
    case "ON_HOLD": {
      const options = resumeTargets(lastRegular);
      // Not yet on the road: can still be cancelled. Already collected: can be sent back.
      if (lastRegular === "CREATED" || lastRegular === "PICKED_UP") options.push("CANCELLED");
      if (lastRegular !== "CREATED") options.push("RETURNED");
      return options;
    }
    case "DELIVERY_ATTEMPT_FAILED":
      return ["OUT_FOR_DELIVERY", "ON_HOLD", "RETURNED"];
    case "DELIVERED":
    case "RETURNED":
    case "CANCELLED":
      return [];
  }
}

export function canTransition(
  from: ShipmentStatus,
  to: ShipmentStatus,
  lastRegular: RegularStatus = isRegularStatus(from) ? from : "CREATED",
): boolean {
  return allowedNext(from, lastRegular).includes(to);
}

export function isTerminal(status: ShipmentStatus): boolean {
  return allowedNext(status, "CREATED").length === 0;
}
