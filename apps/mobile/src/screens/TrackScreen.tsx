import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { NetworkStatus } from "@apollo/client";
import { useQuery } from "@apollo/client/react";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SHIPMENT_QUERY } from "../graphql/queries";
import { ShipmentHeaderCard } from "../components/ShipmentHeaderCard";
import { ShipmentSkeleton } from "../components/Skeleton";
import { Timeline } from "../components/Timeline";
import { Text, TextInput } from "../components/ui";
import { feedback } from "../feedback";
import { buildShareUrl } from "../links";
import type { RootTabParamList } from "../navigation";
import { useTheme, type Theme } from "../theme/theme";
import type { Shipment } from "../types";

const POLL_INTERVAL_MS = 30_000;

/** "Updated just now" / "Updated 42s ago" / "Updated 3m ago". Re-renders itself every 10s. */
function useUpdatedLabel(updatedAt: number | null): string | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  if (updatedAt === null) return null;
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 10) return "Updated just now";
  if (seconds < 60) return `Updated ${seconds}s ago`;
  return `Updated ${Math.floor(seconds / 60)}m ago`;
}

export function TrackScreen() {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootTabParamList, "Track">>();

  const [input, setInput] = useState("");
  const [searchedId, setSearchedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  // True between a user-initiated search and its result, so the "tracked"
  // haptic fires for searches and deep links but not for background polls.
  const userInitiated = useRef(false);

  const { data, error, networkStatus, refetch, startPolling, stopPolling } = useQuery<{
    shipment: Shipment | null;
  }>(SHIPMENT_QUERY, {
    variables: { trackingId: searchedId ?? "" },
    skip: searchedId === null,
    fetchPolicy: "network-only",
    // Polling, not subscriptions: updates are minutes apart and polling needs
    // no WebSocket infrastructure on a free API tier.
    pollInterval: POLL_INTERVAL_MS,
    notifyOnNetworkStatusChange: true,
  });

  const shipment = data?.shipment ?? null;
  const isInitialLoad = networkStatus === NetworkStatus.loading || networkStatus === NetworkStatus.setVariables;

  // Each completed fetch (initial, poll or pull-to-refresh) lands on `ready`.
  useEffect(() => {
    if (networkStatus !== NetworkStatus.ready || searchedId === null) return;
    setUpdatedAt(Date.now());
    if (userInitiated.current) {
      userInitiated.current = false;
      if (data?.shipment) feedback.tracked();
    }
  }, [networkStatus, data, searchedId]);

  // Don't poll while the app is in the background.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        startPolling(POLL_INTERVAL_MS);
        refetch().catch(() => {});
      } else {
        stopPolling();
      }
    });
    return () => sub.remove();
  }, [startPolling, stopPolling, refetch]);

  const search = useCallback(
    (raw: string) => {
      const id = raw.trim().toUpperCase();
      if (!id) return;
      userInitiated.current = true;
      setInput(id);
      if (id === searchedId) {
        refetch().catch(() => {});
      } else {
        setUpdatedAt(null);
        setSearchedId(id);
        // Keep the URL / deep-link param in step with what's on screen.
        navigation.setParams({ trackingId: id } as never);
      }
    },
    [navigation, refetch, searchedId],
  );

  // Deep link (or navigation param) → run that search immediately.
  const paramId = route.params?.trackingId;
  useEffect(() => {
    if (paramId && paramId.toUpperCase() !== searchedId) search(paramId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId]);

  async function handleRefresh() {
    if (searchedId === null) return;
    setRefreshing(true);
    await refetch().catch(() => {});
    setRefreshing(false);
  }

  async function handleShare() {
    if (!shipment) return;
    const url = buildShareUrl(shipment.trackingId);
    const message = `Track shipment ${shipment.trackingId}: ${url}`;
    if (Platform.OS === "web" && typeof navigator !== "undefined" && !navigator.share) {
      // Desktop browsers have no share sheet — copy the link instead.
      await navigator.clipboard?.writeText(url);
      feedback.success("Tracking link copied");
      return;
    }
    await Share.share(Platform.OS === "ios" ? { message, url } : { message }).catch(() => {});
  }

  const updatedLabel = useUpdatedLabel(updatedAt);
  const hasSearched = searchedId !== null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={styles.title}>Track a shipment</Text>
        <Text style={styles.subtitle}>Enter the tracking ID from your receipt.</Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            placeholder="e.g. SHP-7K2M9QXZ"
            autoCapitalize="characters"
            autoCorrect={false}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => search(input)}
            returnKeyType="search"
          />
          <Pressable style={styles.button} onPress={() => search(input)}>
            <Text style={styles.buttonText}>Track</Text>
          </Pressable>
        </View>

        {isInitialLoad && !shipment && <ShipmentSkeleton />}

        {!isInitialLoad && error && !shipment && (
          <Text style={styles.error}>Something went wrong reaching the server. Pull down to retry.</Text>
        )}

        {!isInitialLoad && hasSearched && !error && !shipment && data !== undefined && (
          <Text style={styles.empty}>No shipment found for that tracking ID.</Text>
        )}

        {shipment && (
          <View>
            <View style={styles.metaRow}>
              <Text style={styles.updated}>{updatedLabel ?? ""}</Text>
              <Pressable style={styles.shareButton} onPress={handleShare} hitSlop={8}>
                <Ionicons name="share-outline" size={16} color={t.text} />
                <Text style={styles.shareText}>Share link</Text>
              </Pressable>
            </View>
            <ShipmentHeaderCard shipment={shipment} />
            <Timeline events={shipment.history} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: t.bg },
    content: { padding: 20, paddingBottom: 120 },
    title: { fontSize: 24, fontWeight: "700" },
    subtitle: { fontSize: 14, color: t.textMuted, marginTop: 4, marginBottom: 20 },
    searchRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
    input: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
    },
    button: { backgroundColor: t.primary, borderRadius: 10, paddingHorizontal: 18, justifyContent: "center" },
    buttonText: { color: t.onPrimary, fontWeight: "600" },
    error: { color: t.danger, textAlign: "center", marginTop: 20 },
    empty: { color: t.textMuted, textAlign: "center", marginTop: 20 },
    metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    updated: { fontSize: 12, color: t.textFaint },
    shareButton: { flexDirection: "row", alignItems: "center", gap: 6 },
    shareText: { fontSize: 13, fontWeight: "600" },
  });
