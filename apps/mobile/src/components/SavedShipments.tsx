import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery } from "@apollo/client/react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SHIPMENT_QUERY } from "../graphql/queries";
import { describeEta } from "../eta";
import { useLang, useT } from "../i18n";
import { useTheme, type Theme } from "../theme/theme";
import type { Shipment } from "../types";
import { StatusBadge } from "./StatusBadge";
import { Text } from "./ui";

/** "My shipments": the ones the user saved, each with its current status. */
export function SavedShipments({
  ids,
  onOpen,
  onRemove,
}: {
  ids: string[];
  onOpen: (trackingId: string) => void;
  onRemove: (trackingId: string) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);
  if (ids.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading} accessibilityRole="header">
        {tr("saved.heading")}
      </Text>
      {ids.map((id) => (
        <SavedRow key={id} trackingId={id} onOpen={onOpen} onRemove={onRemove} styles={styles} />
      ))}
    </View>
  );
}

function SavedRow({
  trackingId,
  onOpen,
  onRemove,
  styles,
}: {
  trackingId: string;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const t = useTheme();
  const tr = useT();
  const lang = useLang();
  // cache-and-network: shows the last known status instantly (even offline), then refreshes it.
  const { data } = useQuery<{ shipment: Shipment | null }>(SHIPMENT_QUERY, {
    variables: { trackingId },
    fetchPolicy: "cache-and-network",
  });
  const shipment = data?.shipment ?? null;
  const eta = shipment ? describeEta(shipment, new Date(), lang) : null;

  return (
    <View style={styles.row}>
      <Pressable
        style={({ pressed }) => [styles.main, pressed && { opacity: 0.7 }]}
        onPress={() => onOpen(trackingId)}
        accessibilityRole="button"
        accessibilityLabel={
          shipment
            ? tr("saved.openRoute", { id: trackingId, origin: shipment.origin, destination: shipment.destination })
            : tr("saved.open", { id: trackingId })
        }
      >
        <View style={styles.top}>
          <Text style={styles.id}>{trackingId}</Text>
          {shipment && <StatusBadge status={shipment.currentStatus} />}
        </View>
        {shipment ? (
          <>
            <Text style={styles.route} numberOfLines={1}>
              {shipment.origin} → {shipment.destination}
            </Text>
            {eta && (
              <Text style={[styles.eta, eta.overdue && { color: t.danger }]} numberOfLines={1}>
                {eta.text}
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.route}>{data ? tr("saved.gone") : tr("saved.loading")}</Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => onRemove(trackingId)}
        hitSlop={10}
        style={styles.remove}
        accessibilityRole="button"
        accessibilityLabel={tr("saved.remove", { id: trackingId })}
      >
        <Ionicons name="close" size={18} color={t.textFaint} />
      </Pressable>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { marginTop: 6, gap: 8 },
    heading: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
    row: { flexDirection: "row", alignItems: "center", backgroundColor: t.surface, borderRadius: 12 },
    main: { flex: 1, padding: 14 },
    top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    id: { fontSize: 15, fontWeight: "700", letterSpacing: 0.4 },
    route: { fontSize: 13, color: t.textMuted, marginTop: 6 },
    eta: { fontSize: 13, fontWeight: "600", marginTop: 2 },
    remove: { padding: 14 },
  });
