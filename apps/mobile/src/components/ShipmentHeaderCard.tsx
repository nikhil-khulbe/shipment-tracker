import { StyleSheet, View } from "react-native";
import type { Shipment } from "../types";
import { describeEta } from "../eta";
import { statusProgress } from "../theme/status";
import { useTheme } from "../theme/theme";
import { ProgressBar } from "./ProgressBar";
import { StatusBadge } from "./StatusBadge";
import { Text } from "./ui";

const PACKAGE_LABELS = {
  DOCUMENT: "Document",
  PARCEL: "Parcel",
  FRAGILE: "Fragile",
  ELECTRONICS: "Electronics",
  OTHER: "Other",
} as const;

export function ShipmentHeaderCard({ shipment }: { shipment: Shipment }) {
  const t = useTheme();
  const eta = describeEta(shipment);

  // Only list details that exist: older shipments have none of these.
  const details: string[] = [];
  if (shipment.packageType) details.push(PACKAGE_LABELS[shipment.packageType]);
  if (shipment.weightKg != null) details.push(`${shipment.weightKg} kg`);
  if (shipment.senderName) details.push(`From ${shipment.senderName}`);

  return (
    <View style={[styles.card, { backgroundColor: t.surface }]}>
      <View style={styles.topRow}>
        <Text style={styles.trackingId}>{shipment.trackingId}</Text>
        <StatusBadge status={shipment.currentStatus} />
      </View>

      <View style={styles.route}>
        <Text style={styles.routeText} numberOfLines={1}>
          {shipment.origin}
        </Text>
        <Text style={{ color: t.textFaint }}>→</Text>
        <Text style={styles.routeText} numberOfLines={1}>
          {shipment.destination}
        </Text>
      </View>

      {eta && (
        <Text style={[styles.eta, { color: eta.overdue ? t.danger : t.text }]}>{eta.text}</Text>
      )}

      <Text style={[styles.receiver, { color: t.textMuted }]}>
        Receiver: {shipment.receiverName}
        {shipment.receiverPhone ? `  ·  ${shipment.receiverPhone}` : ""}
      </Text>

      {details.length > 0 && (
        <Text style={[styles.receiver, { color: t.textMuted }]}>{details.join("  ·  ")}</Text>
      )}
      {shipment.description ? (
        <Text style={[styles.receiver, { color: t.textMuted }]} numberOfLines={2}>
          {shipment.description}
        </Text>
      ) : null}

      <ProgressBar
        progress={statusProgress(shipment.currentStatus)}
        color={t.status[shipment.currentStatus]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, marginBottom: 24, gap: 10 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  trackingId: { fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
  route: { flexDirection: "row", alignItems: "center", gap: 8 },
  routeText: { fontSize: 15, flexShrink: 1 },
  eta: { fontSize: 15, fontWeight: "600" },
  receiver: { fontSize: 13 },
});
