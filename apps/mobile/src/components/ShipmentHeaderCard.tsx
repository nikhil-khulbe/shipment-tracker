import { StyleSheet, View } from "react-native";
import type { Shipment } from "../types";
import { describeEta } from "../eta";
import { useT, useLang } from "../i18n";
import { shipmentProgress } from "../theme/status";
import { useTheme } from "../theme/theme";
import { ProgressBar } from "./ProgressBar";
import { StatusBadge } from "./StatusBadge";
import { Text } from "./ui";

export function ShipmentHeaderCard({ shipment }: { shipment: Shipment }) {
  const t = useTheme();
  const tr = useT();
  const lang = useLang();
  const eta = describeEta(shipment, new Date(), lang);

  // Only list details that exist: older shipments have none of these.
  const details: string[] = [];
  if (shipment.packageType) details.push(tr(`package.${shipment.packageType}`));
  if (shipment.weightKg != null) details.push(tr("header.weight", { kg: shipment.weightKg }));
  if (shipment.senderName) details.push(tr("header.from", { name: shipment.senderName }));

  return (
    <View style={[styles.card, { backgroundColor: t.surface }]}>
      <View style={styles.topRow}>
        <Text style={styles.trackingId} accessibilityRole="header">
          {shipment.trackingId}
        </Text>
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
        {tr("header.receiver", { name: shipment.receiverName })}
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
        label={tr("header.progress")}
        progress={shipmentProgress(shipment)}
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
