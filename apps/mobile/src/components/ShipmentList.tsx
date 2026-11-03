import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { NetworkStatus } from "@apollo/client";
import { useQuery } from "@apollo/client/react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SHIPMENTS_QUERY } from "../graphql/queries";
import { STATUS_LABELS } from "../theme/status";
import { useTheme, type Theme } from "../theme/theme";
import { SHIPMENT_STATUSES, type Shipment, type ShipmentStatus } from "../types";
import { Skeleton } from "./Skeleton";
import { StatusBadge } from "./StatusBadge";
import { Text, TextInput } from "./ui";

const PAGE_SIZE = 20;

type ListItem = Pick<Shipment, "id" | "trackingId" | "origin" | "destination" | "receiverName" | "currentStatus">;
type ShipmentsData = { shipments: { items: ListItem[]; nextCursor: string | null } };

/** Waits for the value to stop changing for `delay` ms — so typing doesn't fire a query per keystroke. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/**
 * Admin shipment list: search, status filter chips, infinite scroll.
 *
 * FlatList is the right tool here (unlike the Timeline's `.map()`): this
 * list is unbounded, so rows must be virtualised and loaded a page at a
 * time via cursor pagination.
 */
export function ShipmentList({ onSelect }: { onSelect: (trackingId: string) => void }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  const [searchText, setSearchText] = useState("");
  const [status, setStatus] = useState<ShipmentStatus | null>(null);
  const search = useDebounced(searchText.trim(), 300);

  const { data, error, networkStatus, fetchMore, refetch } = useQuery<ShipmentsData>(SHIPMENTS_QUERY, {
    variables: { status, search: search || null, limit: PAGE_SIZE },
    // Show cached rows instantly, then revalidate in the background.
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });

  const items = data?.shipments.items ?? [];
  const nextCursor = data?.shipments.nextCursor ?? null;
  const isFirstLoad = networkStatus === NetworkStatus.loading || networkStatus === NetworkStatus.setVariables;
  const isFetchingMore = networkStatus === NetworkStatus.fetchMore;
  const [refreshing, setRefreshing] = useState(false);

  function loadMore() {
    if (!nextCursor || isFetchingMore || isFirstLoad) return;
    fetchMore({ variables: { cursor: nextCursor } }).catch(() => {});
  }

  async function handleRefresh() {
    setRefreshing(true);
    await refetch().catch(() => {});
    setRefreshing(false);
  }

  return (
    <View style={styles.flex}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={t.textFaint} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tracking ID"
          autoCapitalize="characters"
          autoCorrect={false}
          value={searchText}
          onChangeText={setSearchText}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <Pressable onPress={() => setSearchText("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={t.textFaint} />
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        <FilterChip label="All" active={status === null} onPress={() => setStatus(null)} styles={styles} />
        {SHIPMENT_STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={STATUS_LABELS[s]}
            active={status === s}
            onPress={() => setStatus(s)}
            styles={styles}
          />
        ))}
      </ScrollView>

      {isFirstLoad && items.length === 0 ? (
        <View style={styles.skeletons}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.row}>
              <Skeleton width={120} height={16} />
              <Skeleton width="70%" height={13} style={{ marginTop: 10 }} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => onSelect(item.trackingId)}
            >
              <View style={styles.rowTop}>
                <Text style={styles.rowId}>{item.trackingId}</Text>
                <StatusBadge status={item.currentStatus} />
              </View>
              <Text style={styles.rowRoute} numberOfLines={1}>
                {item.origin} → {item.destination}
              </Text>
              <Text style={styles.rowReceiver} numberOfLines={1}>
                {item.receiverName}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error ? "Couldn't load shipments. Pull down to retry." : "No shipments match."}
            </Text>
          }
          ListFooterComponent={isFetchingMore ? <ActivityIndicator color={t.text} style={styles.footer} /> : undefined}
        />
      )}
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 20,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 10,
    },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, borderWidth: 0 },
    chipScroll: { flexGrow: 0, flexShrink: 0, height: 34, marginVertical: 12 },
    chipRow: { paddingHorizontal: 20, gap: 8 },
    chip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surfaceAlt,
    },
    chipActive: { backgroundColor: t.primary, borderColor: t.primary },
    chipText: { fontSize: 13, fontWeight: "600", color: t.textMuted },
    chipTextActive: { color: t.onPrimary },
    listContent: { paddingHorizontal: 20, paddingBottom: 120, gap: 10 },
    skeletons: { paddingHorizontal: 20, gap: 10 },
    row: { backgroundColor: t.surface, borderRadius: 12, padding: 14 },
    rowPressed: { opacity: 0.7 },
    rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    rowId: { fontSize: 15, fontWeight: "700", letterSpacing: 0.4 },
    rowRoute: { fontSize: 14, marginTop: 8 },
    rowReceiver: { fontSize: 12, color: t.textMuted, marginTop: 2 },
    empty: { textAlign: "center", color: t.textMuted, marginTop: 32 },
    footer: { paddingVertical: 16 },
  });
