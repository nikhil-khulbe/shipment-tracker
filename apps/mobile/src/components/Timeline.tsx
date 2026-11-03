import { StyleSheet, Text, View } from "react-native";
import type { StatusEvent } from "../types";
import { StatusBadge } from "./StatusBadge";

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
 */
export function Timeline({ events }: { events: StatusEvent[] }) {
  const newestFirst = [...events].reverse();

  return (
    <View>
      {newestFirst.map((event, index) => {
        const isLast = index === newestFirst.length - 1;
        return (
          <View key={`${event.status}-${event.timestamp}`} style={styles.row}>
            <View style={styles.rail}>
              <View style={styles.dot} />
              {!isLast && <View style={styles.connector} />}
            </View>

            <View style={styles.content}>
              <StatusBadge status={event.status} />
              <Text style={styles.location}>{event.location}</Text>
              {event.note ? <Text style={styles.note}>{event.note}</Text> : null}
              <Text style={styles.timestamp}>{formatTimestamp(event.timestamp)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
  },
  rail: {
    width: 24,
    alignItems: "center",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#111827",
    marginTop: 4,
  },
  connector: {
    flex: 1,
    width: 2,
    backgroundColor: "#e5e7eb",
    marginVertical: 4,
  },
  content: {
    flex: 1,
    paddingBottom: 20,
    gap: 4,
  },
  location: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginTop: 4,
  },
  note: {
    fontSize: 13,
    color: "#4b5563",
  },
  timestamp: {
    fontSize: 12,
    color: "#9ca3af",
  },
});
