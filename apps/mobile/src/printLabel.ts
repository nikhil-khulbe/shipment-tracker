import { Platform } from "react-native";
import { qrSvg } from "./qr";
import { buildShareUrl } from "./links";
import type { Shipment } from "./types";

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** What the QR code encodes: the public tracking link, so any phone camera can open it. */
export function labelQrText(trackingId: string): string {
  return buildShareUrl(trackingId);
}

/** A self-contained, printable shipping label (4x6 inch style). */
export function buildLabelHtml(shipment: Shipment): string {
  const lines = [
    shipment.packageType ? esc(shipment.packageType) : null,
    shipment.weightKg != null ? `${shipment.weightKg} kg` : null,
    shipment.senderName ? `From: ${esc(shipment.senderName)}` : null,
  ].filter(Boolean);
  const eta = shipment.estimatedDelivery ? new Date(shipment.estimatedDelivery).toLocaleDateString() : null;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(shipment.trackingId)}</title>
<style>
  @page { size: 100mm 150mm; margin: 6mm; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #000; }
  .id { font-size: 24px; font-weight: 700; letter-spacing: 1px; text-align: center; margin: 4px 0 8px; }
  .qr { text-align: center; }
  .route { font-size: 20px; font-weight: 700; text-align: center; margin: 10px 0 4px; }
  .to { font-size: 16px; text-align: center; margin: 2px 0; }
  .meta { font-size: 13px; text-align: center; margin: 6px 0 0; color: #333; }
  .scan { font-size: 11px; text-align: center; margin-top: 10px; color: #555; }
</style></head><body>
  <div class="id">${esc(shipment.trackingId)}</div>
  <div class="qr">${qrSvg(labelQrText(shipment.trackingId), 200)}</div>
  <div class="route">${esc(shipment.origin)} &rarr; ${esc(shipment.destination)}</div>
  <div class="to">To: ${esc(shipment.receiverName)}</div>
  ${lines.length ? `<div class="meta">${lines.join(" &middot; ")}</div>` : ""}
  ${eta ? `<div class="meta">Expected by ${esc(eta)}</div>` : ""}
  <div class="scan">Scan to track this shipment</div>
  <script>window.onload = function () { setTimeout(function () { window.focus(); window.print(); }, 150); };</script>
</body></html>`;
}

/** Opens the system print dialog for the label. Returns false if the browser blocked the popup. */
export async function printLabel(shipment: Shipment): Promise<boolean> {
  const html = buildLabelHtml(shipment);
  if (Platform.OS === "web") {
    const win = typeof window !== "undefined" ? window.open("", "_blank", "width=480,height=720") : null;
    if (!win) return false;
    win.document.open();
    win.document.write(html);
    win.document.close();
    return true;
  }
  // Native: expo-print renders the HTML and opens the OS print sheet. The
  // inline <script> above is ignored there, which is fine.
  const Print = await import("expo-print");
  await Print.printAsync({ html });
  return true;
}
