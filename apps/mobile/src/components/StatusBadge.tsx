import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ShipmentStatus } from "../types";
import { useLang } from "../i18n";
import { STATUS_ICONS, statusLabel } from "../theme/status";
import { useTheme } from "../theme/theme";
import { Text } from "./ui";

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  const t = useTheme();
  const lang = useLang();
  const color = t.status[status];
  return (
    <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: color }]}>
      <Ionicons name={STATUS_ICONS[status]} size={14} color={color} style={styles.icon} accessibilityElementsHidden importantForAccessibility="no" />
      <Text style={[styles.label, { color }]}>{statusLabel(status, lang)}</Text>
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
  icon: { marginRight: 6 },
  label: { fontSize: 13, fontWeight: "600" },
});
