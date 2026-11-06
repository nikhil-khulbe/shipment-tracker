import { useMemo } from "react";
import { View } from "react-native";
import { darkRuns, makeQr, QUIET_ZONE } from "../qr";

/**
 * A QR code drawn with plain Views, so it needs no SVG library. Always dark
 * on white regardless of theme: scanners need the contrast.
 */
export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const { runs, total } = useMemo(() => {
    const matrix = makeQr(value);
    return { runs: darkRuns(matrix), total: matrix.size + QUIET_ZONE * 2 };
  }, [value]);
  const module = size / total;

  return (
    <View
      style={{ width: size, height: size, backgroundColor: "#fff" }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`QR code for ${value}`}
    >
      {runs.map((run) => (
        <View
          key={`${run.x}-${run.y}`}
          style={{
            position: "absolute",
            left: (run.x + QUIET_ZONE) * module,
            top: (run.y + QUIET_ZONE) * module,
            width: run.length * module + 0.5,
            height: module + 0.5,
            backgroundColor: "#000",
          }}
        />
      ))}
    </View>
  );
}
