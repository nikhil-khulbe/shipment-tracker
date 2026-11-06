import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { NetworkStatus } from "@apollo/client";
import { useMutation, useQuery } from "@apollo/client/react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SHIPMENTS_QUERY } from "../graphql/queries";
import { BULK_UPDATE_MUTATION } from "../graphql/mutations";
import { feedback } from "../feedback";
import { STATUS_LABELS } from "../theme/status";
import { useTheme, type Theme } from "../theme/theme";
import { isExceptionStatus, SHIPMENT_STATUSES, type Shipment, type ShipmentStatus } from "../types";
import { Skeleton } from "./Skeleton";
import { StatusBadge } from "./StatusBadge";
import { Text, TextInput } from "./ui";

const PAGE_SIZE = 20;

type ListItem = Pick<
  Shipment,
  "id" | "trackingId" | "origin" | "destination" | "receiverName" | "currentStatus" | "allowedNextStatuses"
>;
type ShipmentsData = { shipments: { items: ListItem[]; nextCursor: string | null } };
type BulkResult = { trackingId: string; ok: boolean; error: string | null; status: ShipmentStatus | null };

/** Waits for the value to stop changing for `delay` ms — so typing doesn't fire a query per keystroke. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Statuses that every selected shipment is allowed to move to next. */
export function commonNextStatuses(selected: ShipmentStatus[][]): ShipmentStatus[] {
  if (selected.length === 0) return [];
  return selected[0]!.filter((status) => selected.every((options) => options.includes(status)));
}

/**
 * Admin shipment list: search, status filter chips, infinite scroll, and a
 * "Select" mode for moving several shipments to the same status at once.
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

  // Bulk selection: trackingId -> the moves that shipment allows.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Record<string, ShipmentStatus[]>>({});
  const [target, setTarget] = useState<ShipmentStatus | null>(null);
  const [bulkLocation, setBulkLocation] = useState("");
  const [bulkNote, setBulkNote] = useState("");
  const [bulkProblems, setBulkProblems] = useState<string[]>([]);

  const { data, error, networkStatus, fetchMore, refetch } = useQuery<ShipmentsData>(SHIPMENTS_QUERY, {
    variables: { status, search: search || null, limit: PAGE_SIZE },
    // Show cached rows instantly, then revalidate in the background.
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });
  const [bulkUpdate, { loading: bulkLoading }] = useMutation<{ bulkUpdateStatus: BulkResult[] }>(BULK_UPDATE_MUTATION, {
    refetchQueries: ["Shipments", "Shipment", "Dashboard"],
  });

  const items = data?.shipments.items ?? [];
  const nextCursor = data?.shipments.nextCursor ?? null;
  const isFirstLoad = networkStatus === NetworkStatus.loading || networkStatus === NetworkStatus.setVariables;
  const isFetchingMore = networkStatus === NetworkStatus.fetchMore;
  const [refreshing, setRefreshing] = useState(false);

  const selectedIds = Object.keys(selected);
  const common: ShipmentStatus[] = commonNextStatuses(Object.values(selected)).filter((s) => s !== "DELIVERED");
  // If the selection changes so the chosen target is no longer valid, drop it.
  const activeTarget = target && common.includes(target) ? target : null;

  function loadMore() {
    if (!nextCursor || isFetchingMore || isFirstLoad) return;
    fetchMore({ variables: { cursor: nextCursor } }).catch(() => {});
  }

  async function handleRefresh() {
    setRefreshing(true);
    await refetch().catch(() => {});
    setRefreshing(false);
  }

  function toggle(item: ListItem) {
    setBulkProblems([]);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[item.trackingId]) delete next[item.trackingId];
      else next[item.trackingId] = item.allowedNextStatuses ?? [];
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected({});
    setTarget(null);
    setBulkLocation("");
    setBulkNote("");
    setBulkProblems([]);
  }

  async function applyBulk() {
    if (!activeTarget || selectedIds.length === 0) return;
    const location = bulkLocation.trim();
    const note = bulkNote.trim();
    if (!location) {
      setBulkProblems(["Enter the location."]);
      return;
    }
    if (isExceptionStatus(activeTarget) && !note) {
      setBulkProblems(["Please give a reason."]);
      return;
    }
    const response = await bulkUpdate({
      variables: { trackingIds: selectedIds, status: activeTarget, location, note: note || null },
    }).catch((e: Error) => {
      setBulkProblems([e.message]);
      return null;
    });
    const results = response?.data?.bulkUpdateStatus;
    if (!results) return;

    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    if (ok.length > 0) feedback.success(`Moved ${ok.length} of ${results.length} to ${STATUS_LABELS[activeTarget]}`);
    setBulkProblems(failed.map((r) => `${r.trackingId}: ${r.error}`));
    // Keep only the failures selected so they can be looked at.
    setSelected((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => failed.some((r) => r.trackingId === id))));
    if (failed.length === 0) stopSelecting();
  }

  return (
    <View style={styles.flex}>
      <View style={styles.topRow}>
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
            accessibilityLabel="Search by tracking ID"
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={t.textFaint} />
            </Pressable>
          )}
        </View>
        <Pressable
          style={[styles.selectButton, selecting && styles.selectButtonOn]}
          onPress={() => (selecting ? stopSelecting() : setSelecting(true))}
          accessibilityRole="button"
          accessibilityState={{ selected: selecting }}
        >
          <Text style={[styles.selectText, selecting && { color: t.onPrimary }]}>{selecting ? "Done" : "Select"}</Text>
        </Pressable>
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
          extraData={selected}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={[styles.listContent, selecting && { paddingBottom: 340 }]}
          renderItem={({ item }) => {
            const checked = Boolean(selected[item.trackingId]);
            return (
              <Pressable
                style={({ pressed }) => [styles.row, checked && styles.rowChecked, pressed && styles.rowPressed]}
                onPress={() => (selecting ? toggle(item) : onSelect(item.trackingId))}
                accessibilityRole={selecting ? "checkbox" : "button"}
                accessibilityState={selecting ? { checked } : undefined}
                accessibilityLabel={`${item.trackingId}, ${STATUS_LABELS[item.currentStatus]}, ${item.origin} to ${item.destination}`}
              >
                <View style={styles.rowTop}>
                  <View style={styles.rowIdWrap}>
                    {selecting && (
                      <Ionicons name={checked ? "checkbox" : "square-outline"} size={20} color={checked ? t.primary : t.textFaint} />
                    )}
                    <Text style={styles.rowId}>{item.trackingId}</Text>
                  </View>
                  <StatusBadge status={item.currentStatus} />
                </View>
                <Text style={styles.rowRoute} numberOfLines={1}>
                  {item.origin} → {item.destination}
                </Text>
                <Text style={styles.rowReceiver} numberOfLines={1}>
                  {item.receiverName}
                </Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error ? "Couldn't load shipments. Pull down to retry." : "No shipments match."}
            </Text>
          }
          ListFooterComponent={isFetchingMore ? <ActivityIndicator color={t.text} style={styles.footer} /> : undefined}
        />
      )}

      {selecting && (
        <View style={styles.bulkBar}>
          <View style={styles.bulkTop}>
            <Text style={styles.bulkCount}>{selectedIds.length} selected</Text>
            <Pressable
              onPress={() =>
                setSelected(Object.fromEntries(items.map((item) => [item.trackingId, item.allowedNextStatuses ?? []])))
              }
              accessibilityRole="button"
            >
              <Text style={styles.bulkLink}>Select all loaded</Text>
            </Pressable>
          </View>

          {selectedIds.length === 0 ? (
            <Text style={styles.bulkHint}>Tap shipments to select them.</Text>
          ) : common.length === 0 ? (
            <Text style={styles.bulkHint}>
              These shipments have no next status in common. Select ones in the same stage.
            </Text>
          ) : (
            <>
              <Text style={styles.bulkHint}>Move to:</Text>
              <View style={styles.bulkChips}>
                {common.map((s) => {
                  const on = s === activeTarget;
                  return (
                    <Pressable
                      key={s}
                      style={[styles.chip, on && styles.chipActive]}
                      onPress={() => setTarget(s)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextActive]}>{STATUS_LABELS[s]}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {activeTarget && (
                <>
                  <TextInput
                    style={styles.bulkInput}
                    placeholder="Location (e.g. Nagpur Hub)"
                    value={bulkLocation}
                    onChangeText={setBulkLocation}
                    accessibilityLabel="Location"
                  />
                  {isExceptionStatus(activeTarget) && (
                    <TextInput
                      style={styles.bulkInput}
                      placeholder="Reason (required)"
                      value={bulkNote}
                      onChangeText={setBulkNote}
                      accessibilityLabel="Reason"
                    />
                  )}
                  <Pressable style={styles.bulkApply} onPress={applyBulk} disabled={bulkLoading} accessibilityRole="button">
                    {bulkLoading ? (
                      <ActivityIndicator color={t.onPrimary} />
                    ) : (
                      <Text style={styles.bulkApplyText}>
                        Move {selectedIds.length} to {STATUS_LABELS[activeTarget]}
                      </Text>
                    )}
                  </Pressable>
                </>
              )}
            </>
          )}
          {bulkProblems.map((problem, i) => (
            <Text key={i} style={styles.bulkError}>
              {problem}
            </Text>
          ))}
        </View>
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
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    topRow: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 20 },
    searchBox: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 10,
    },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, borderWidth: 0 },
    selectButton: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.text,
    },
    selectButtonOn: { backgroundColor: t.primary, borderColor: t.primary },
    selectText: { fontWeight: "600", fontSize: 14 },
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
    row: { backgroundColor: t.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "transparent" },
    rowChecked: { borderColor: t.primary },
    rowPressed: { opacity: 0.7 },
    rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    rowIdWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
    rowId: { fontSize: 15, fontWeight: "700", letterSpacing: 0.4 },
    rowRoute: { fontSize: 14, marginTop: 8 },
    rowReceiver: { fontSize: 12, color: t.textMuted, marginTop: 2 },
    empty: { textAlign: "center", color: t.textMuted, marginTop: 32 },
    footer: { paddingVertical: 16 },
    bulkBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.bg,
      borderTopWidth: 1,
      borderTopColor: t.border,
      padding: 16,
      gap: 8,
    },
    bulkTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    bulkCount: { fontWeight: "700", fontSize: 15 },
    bulkLink: { color: t.primary, fontWeight: "600", fontSize: 13 },
    bulkHint: { fontSize: 13, color: t.textMuted },
    bulkChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    bulkInput: { borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
    bulkApply: { backgroundColor: t.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
    bulkApplyText: { color: t.onPrimary, fontWeight: "600" },
    bulkError: { color: t.danger, fontSize: 12 },
  });
