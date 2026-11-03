import { StyleSheet, Text, View } from "react-native";
import type { Shipment } from "../types";
import { StatusBadge } from "./StatusBadge";

export function ShipmentHeaderCard({ shipment }: { shipment: Shipment }) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.trackingId}>{shipment.trackingId}</Text>
        <StatusBadge status={shipment.currentStatus} />
      </View>

      <View style={styles.route}>
        <Text style={styles.routeText} numberOfLines={1}>
          {shipment.origin}
        </Text>
        <Text style={styles.arrow}>→</Text>
        <Text style={styles.routeText} numberOfLines={1}>
          {shipment.destination}
        </Text>
      </View>

      <Text style={styles.receiver}>Receiver: {shipment.receiverName}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  trackingId: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: 0.5,
  },
  route: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeText: {
    fontSize: 15,
    color: "#1f2937",
    flexShrink: 1,
  },
  arrow: {
    color: "#9ca3af",
  },
  receiver: {
    fontSize: 13,
    color: "#6b7280",
  },
});
