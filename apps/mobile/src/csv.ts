import { PACKAGE_TYPES, type PackageType } from "./types";

/**
 * Parsing for the admin "Import shipments" box. Pure functions, no React.
 *
 * Expected columns (a header row is required; order doesn't matter):
 *   origin, destination, receiverName            required
 *   senderName, receiverPhone, packageType,
 *   weightKg, description, estimatedDelivery     optional (estimatedDelivery as YYYY-MM-DD)
 */

export type ImportRow = {
  origin: string;
  destination: string;
  receiverName: string;
  senderName?: string;
  receiverPhone?: string;
  packageType?: PackageType;
  weightKg?: number;
  description?: string;
  estimatedDelivery?: string;
};

export type RowProblem = { line: number; message: string };
export type ParsedImport = {
  rows: ImportRow[];
  /** 1-based file line each accepted row came from, parallel to `rows`. */
  lines: number[];
  problems: RowProblem[];
};

const HEADER_ALIASES: Record<string, keyof ImportRow> = {
  origin: "origin",
  from: "origin",
  destination: "destination",
  to: "destination",
  receivername: "receiverName",
  receiver: "receiverName",
  sendername: "senderName",
  sender: "senderName",
  receiverphone: "receiverPhone",
  phone: "receiverPhone",
  packagetype: "packageType",
  type: "packageType",
  weightkg: "weightKg",
  weight: "weightKg",
  description: "description",
  estimateddelivery: "estimatedDelivery",
  eta: "estimatedDelivery",
};

/** Splits CSV text into records of fields. Handles quotes, escaped quotes ("") and CRLF. */
export function splitCsv(text: string): { fields: string[]; line: number }[] {
  const records: { fields: string[]; line: number }[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endRecord = () => {
    fields.push(field);
    // Skip completely blank lines.
    if (fields.some((f) => f.trim() !== "")) records.push({ fields, line: recordLine });
    fields = [];
    field = "";
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else if (ch === "\r") {
      // swallow; the \n that follows ends the record
    } else if (ch === "\n") {
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += ch;
    }
  }
  endRecord();
  return records;
}

export function parseShipmentsCsv(text: string): ParsedImport {
  const records = splitCsv(text.replace(/^﻿/, ""));
  const result: ParsedImport = { rows: [], lines: [], problems: [] };
  if (records.length === 0) {
    result.problems.push({ line: 1, message: "Paste a CSV with a header row and at least one shipment." });
    return result;
  }

  const [header, ...body] = records;
  const columns = header!.fields.map((name) => HEADER_ALIASES[name.trim().toLowerCase().replace(/[\s_-]/g, "")] ?? null);
  for (const required of ["origin", "destination", "receiverName"] as const) {
    if (!columns.includes(required)) {
      result.problems.push({ line: header!.line, message: `The header row is missing a "${required}" column.` });
    }
  }
  if (result.problems.length > 0) return result;
  if (body.length === 0) {
    result.problems.push({ line: header!.line, message: "There are no shipments below the header row." });
    return result;
  }

  for (const record of body) {
    const row: Partial<Record<keyof ImportRow, string>> = {};
    columns.forEach((key, index) => {
      const value = (record.fields[index] ?? "").trim();
      if (key && value) row[key] = value;
    });

    const missing = (["origin", "destination", "receiverName"] as const).filter((key) => !row[key]);
    if (missing.length > 0) {
      result.problems.push({ line: record.line, message: `Missing ${missing.join(", ")}.` });
      continue;
    }

    const out: ImportRow = { origin: row.origin!, destination: row.destination!, receiverName: row.receiverName! };
    if (row.senderName) out.senderName = row.senderName;
    if (row.receiverPhone) out.receiverPhone = row.receiverPhone;
    if (row.description) out.description = row.description;

    if (row.packageType) {
      const type = row.packageType.toUpperCase();
      if (!(PACKAGE_TYPES as readonly string[]).includes(type)) {
        result.problems.push({
          line: record.line,
          message: `Unknown package type "${row.packageType}" (use ${PACKAGE_TYPES.join(", ")}).`,
        });
        continue;
      }
      out.packageType = type as PackageType;
    }
    if (row.weightKg) {
      const weight = Number(row.weightKg);
      if (!Number.isFinite(weight) || weight <= 0) {
        result.problems.push({ line: record.line, message: `Weight "${row.weightKg}" is not a positive number.` });
        continue;
      }
      out.weightKg = weight;
    }
    if (row.estimatedDelivery) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.estimatedDelivery) || Number.isNaN(new Date(row.estimatedDelivery).getTime())) {
        result.problems.push({ line: record.line, message: `Date "${row.estimatedDelivery}" should look like 2026-11-30.` });
        continue;
      }
      out.estimatedDelivery = `${row.estimatedDelivery}T12:00:00.000Z`;
    }

    result.rows.push(out);
    result.lines.push(record.line);
  }
  return result;
}

export const CSV_TEMPLATE =
  "origin,destination,receiverName,receiverPhone,packageType,weightKg,estimatedDelivery\n" +
  "Delhi,Mumbai,Asha Rao,+91 98765 43210,PARCEL,2.5,2026-12-01\n";
