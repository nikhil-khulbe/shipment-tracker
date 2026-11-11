/**
 * Turning a shipment's status history and edit log into flat audit rows and a
 * CSV. Pure functions: no Mongo, no GraphQL.
 */

export type AuditRow = {
  at: Date;
  trackingId: string;
  /** STATUS = a status event, EDIT = one changed field on the shipment. */
  event: "STATUS" | "EDIT";
  /** "status" for status events, otherwise the name of the edited field. */
  field: string;
  from: string;
  to: string;
  location: string;
  note: string;
  by: string;
};

type HistoryEvent = { status: string; location?: string | null; note?: string | null; timestamp: Date | string; by?: string | null };
type EditEvent = {
  at: Date | string;
  by?: string | null;
  changes?: { field: string; from?: string | null; to?: string | null }[] | null;
};
type ExportableShipment = { trackingId: string; history?: HistoryEvent[]; edits?: EditEvent[] };

export const AUDIT_COLUMNS = ["timestamp", "trackingId", "event", "field", "from", "to", "location", "note", "by"] as const;

/** One row per status event and one per changed field, with the previous status as `from`. */
export function auditRowsFor(shipment: ExportableShipment): AuditRow[] {
  const rows: AuditRow[] = [];
  let previous = "";
  for (const event of shipment.history ?? []) {
    rows.push({
      at: new Date(event.timestamp),
      trackingId: shipment.trackingId,
      event: "STATUS",
      field: "status",
      from: previous,
      to: event.status,
      location: event.location ?? "",
      note: event.note ?? "",
      by: event.by ?? "",
    });
    previous = event.status;
  }
  for (const edit of shipment.edits ?? []) {
    for (const change of edit.changes ?? []) {
      rows.push({
        at: new Date(edit.at),
        trackingId: shipment.trackingId,
        event: "EDIT",
        field: change.field,
        from: change.from ?? "",
        to: change.to ?? "",
        location: "",
        note: "",
        by: edit.by ?? "",
      });
    }
  }
  return rows;
}

/**
 * One CSV cell. Two things matter beyond quoting:
 *  - A cell starting with = + - @ (or a tab/CR) is read as a formula by Excel
 *    and Sheets, and staff-typed notes end up here, so it is prefixed with an
 *    apostrophe ("CSV injection").
 *  - Fields with commas, quotes or newlines are quoted, with quotes doubled.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Oldest first, so the file reads as a timeline. */
export function buildAuditCsv(rows: AuditRow[]): string {
  const sorted = [...rows].sort((a, b) => a.at.getTime() - b.at.getTime() || a.trackingId.localeCompare(b.trackingId));
  const lines = [AUDIT_COLUMNS.join(",")];
  for (const row of sorted) {
    lines.push(
      [row.at.toISOString(), row.trackingId, row.event, row.field, row.from, row.to, row.location, row.note, row.by]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
