import { StyleSheet, View } from "react-native";
import type { Shipment } from "../types";
import { statusProgress } from "../theme/status";
import { useTheme } from "../theme/theme";
import { ProgressBar } from "./ProgressBar";
import { StatusBadge } from "./StatusBadge";
import { Text } from "./ui";

export function ShipmentHeaderCard({ shipment }: { shipment: Shipment }) {
  const t = useTheme();
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

      <Text style={[styles.receiver, { color: t.textMuted }]}>Receiver: {shipment.receiverName}</Text>

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
  receiver: { fontSize: 13 },
});
