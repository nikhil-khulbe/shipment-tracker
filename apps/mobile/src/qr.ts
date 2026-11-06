import QRCode from "qrcode";

/** A QR code as a grid of dark/light modules. */
export type QrMatrix = { size: number; isDark: (x: number, y: number) => boolean };

/** Quiet zone (blank border) in modules. The QR spec asks for 4; scanners need it. */
export const QUIET_ZONE = 4;

export function makeQr(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const { size, data } = modules;
  return { size, isDark: (x, y) => data[y * size + x] === 1 };
}

/**
 * Horizontal runs of consecutive dark modules. Drawing one rectangle per run
 * (instead of one per module) cuts a typical code from ~500 shapes to ~150.
 */
export function darkRuns(matrix: QrMatrix): { x: number; y: number; length: number }[] {
  const runs: { x: number; y: number; length: number }[] = [];
  for (let y = 0; y < matrix.size; y++) {
    let start = -1;
    for (let x = 0; x <= matrix.size; x++) {
      const dark = x < matrix.size && matrix.isDark(x, y);
      if (dark && start === -1) start = x;
      if (!dark && start !== -1) {
        runs.push({ x: start, y, length: x - start });
        start = -1;
      }
    }
  }
  return runs;
}

/** The QR code as a standalone SVG string (used in the printable label). */
export function qrSvg(text: string, pixels = 180): string {
  const matrix = makeQr(text);
  const total = matrix.size + QUIET_ZONE * 2;
  const rects = darkRuns(matrix)
    .map((r) => `<rect x="${r.x + QUIET_ZONE}" y="${r.y + QUIET_ZONE}" width="${r.length}" height="1"/>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#fff"/><g fill="#000">${rects}</g></svg>`
  );
}
