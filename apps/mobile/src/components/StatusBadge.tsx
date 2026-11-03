import { StyleSheet, Text, View } from "react-native";
import type { ShipmentStatus } from "../types";

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  CREATED: "Created",
  PICKED_UP: "Picked Up",
  IN_TRANSIT: "In Transit",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
};

const STATUS_COLORS: Record<ShipmentStatus, string> = {
  CREATED: "#6b7280", // grey — just entered the system
  PICKED_UP: "#2563eb", // blue
  IN_TRANSIT: "#7c3aed", // purple
  OUT_FOR_DELIVERY: "#d97706", // amber — almost there
  DELIVERED: "#16a34a", // green — done
};

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <View style={[styles.badge, { backgroundColor: `${color}1A`, borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
});
