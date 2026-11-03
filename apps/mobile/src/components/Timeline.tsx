import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { StatusEvent } from "../types";
import { STATUS_ICONS } from "../theme/status";
import { useTheme } from "../theme/theme";
import { StatusBadge } from "./StatusBadge";
import { Text } from "./ui";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Plain `.map()`, not FlatList — a shipment has at most five events
 * (one per status), so there's nothing to virtualize. FlatList would
 * be the right call the moment this list could grow unbounded.
 *
 * Each row slides in with a stagger (index * 80ms). Keys include the
 * status, so when polling returns the same events the rows are not
 * remounted and don't re-animate; only a genuinely new event does.
 */
export function Timeline({ events }: { events: StatusEvent[] }) {
  const t = useTheme();
  const newestFirst = [...events].reverse();

  return (
    <View>
      {newestFirst.map((event, index) => {
        const isLast = index === newestFirst.length - 1;
        const color = t.status[event.status];
        return (
          <Animated.View
            key={`${event.status}-${event.timestamp}`}
            entering={FadeInDown.delay(index * 80).springify()}
            style={styles.row}
          >
            <View style={styles.rail}>
              <View style={[styles.node, { backgroundColor: color }]}>
                <Ionicons name={STATUS_ICONS[event.status]} size={13} color={t.bg} />
              </View>
              {!isLast && <View style={[styles.connector, { backgroundColor: t.border }]} />}
            </View>

            <View style={styles.content}>
              <StatusBadge status={event.status} />
              <Text style={styles.location}>{event.location}</Text>
              {event.note ? <Text style={[styles.note, { color: t.textMuted }]}>{event.note}</Text> : null}
              <Text style={[styles.timestamp, { color: t.textFaint }]}>{formatTimestamp(event.timestamp)}</Text>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  rail: { width: 28, alignItems: "center" },
  node: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  connector: { flex: 1, width: 2, marginVertical: 4 },
  content: { flex: 1, paddingBottom: 20, paddingLeft: 8, gap: 4 },
  location: { fontSize: 15, fontWeight: "600", marginTop: 4 },
  note: { fontSize: 13 },
  timestamp: { fontSize: 12 },
});
