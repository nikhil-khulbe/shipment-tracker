import { Platform, Share } from "react-native";

/** e.g. audit-log-2026-11-11.csv */
export function auditFileName(now: Date = new Date()): string {
  return `audit-log-${now.toISOString().slice(0, 10)}.csv`;
}

/**
 * Hands a CSV to the user. On web it downloads a file; on native it opens the
 * system share sheet with the text (save to Files, email, paste into a sheet),
 * which avoids needing a file-system permission or extra native module.
 */
export async function deliverCsv(fileName: string, csv: string): Promise<void> {
  if (Platform.OS === "web") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: fileName, message: csv });
}
