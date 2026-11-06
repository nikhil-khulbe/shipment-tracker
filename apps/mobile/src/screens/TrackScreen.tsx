import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Linking,
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
import { useRecentSearches } from "../recentSearches";
import { useSavedShipments } from "../savedShipments";
import { SavedShipments } from "../components/SavedShipments";
import { setLang, useLang, useT } from "../i18n";
import { buildShareUrl } from "../links";
import type { RootTabParamList } from "../navigation";
import { useTheme, type Theme } from "../theme/theme";
import type { Shipment } from "../types";

const POLL_INTERVAL_MS = 30_000;

/** "Updated just now" / "Updated 42s ago" / "Updated 3m ago". Re-renders itself every 10s. */
function useUpdatedLabel(updatedAt: number | null): string | null {
  const tr = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  if (updatedAt === null) return null;
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 10) return tr("track.updatedNow");
  if (seconds < 60) return tr("track.updatedSeconds", { n: seconds });
  return tr("track.updatedMinutes", { n: Math.floor(seconds / 60) });
}

export function TrackScreen() {
  const t = useTheme();
  const tr = useT();
  const lang = useLang();
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
  const { recent, add: addRecent } = useRecentSearches();
  const { saved, isSaved, toggle: toggleSaved } = useSavedShipments();

  const { data, error, networkStatus, refetch, startPolling, stopPolling } = useQuery<{
    shipment: Shipment | null;
  }>(SHIPMENT_QUERY, {
    variables: { trackingId: searchedId ?? "" },
    skip: searchedId === null,
    // Show whatever we have cached (including last session's, restored from
    // disk) immediately, then refresh from the network. Offline, the network
    // half fails but the cached shipment stays on screen.
    fetchPolicy: "cache-and-network",
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
      if (data?.shipment) {
        feedback.tracked();
        addRecent(data.shipment.trackingId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const message = tr("track.shareMessage", { id: shipment.trackingId, url });
    if (Platform.OS === "web" && typeof navigator !== "undefined" && !navigator.share) {
      // Desktop browsers have no share sheet — copy the link instead.
      await navigator.clipboard?.writeText(url);
      feedback.success(tr("track.linkCopied"));
      return;
    }
    await Share.share(Platform.OS === "ios" ? { message, url } : { message }).catch(() => {});
  }

  function handleRoute() {
    if (!shipment) return;
    // A Google Maps directions link works on every platform without an API key.
    const url =
      "https://www.google.com/maps/dir/?api=1" +
      `&origin=${encodeURIComponent(shipment.origin)}&destination=${encodeURIComponent(shipment.destination)}`;
    Linking.openURL(url).catch(() => feedback.error(tr("track.mapsError")));
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
        <View style={styles.titleRow}>
          <Text style={styles.title} accessibilityRole="header">
            {tr("track.title")}
          </Text>
          <Pressable
            style={styles.langButton}
            onPress={() => setLang(lang === "en" ? "hi" : "en")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={tr("lang.switchLabel")}
          >
            <Ionicons name="language-outline" size={16} color={t.text} />
            <Text style={styles.langText}>{tr("lang.switchTo")}</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>{tr("track.subtitle")}</Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            placeholder={tr("track.placeholder")}
            accessibilityLabel={tr("track.inputLabel")}
            autoCapitalize="characters"
            autoCorrect={false}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => search(input)}
            returnKeyType="search"
          />
          <Pressable style={styles.button} onPress={() => search(input)} accessibilityRole="button">
            <Text style={styles.buttonText}>{tr("track.button")}</Text>
          </Pressable>
        </View>

        {recent.length > 0 && (
          <View style={styles.recentRow}>
            {recent.map((id) => (
              <Pressable
                key={id}
                style={styles.recentChip}
                onPress={() => search(id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={tr("track.searchAgain", { id })}
              >
                <Ionicons name="time-outline" size={13} color={t.textMuted} />
                <Text style={styles.recentText}>{id}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {!hasSearched && <SavedShipments ids={saved} onOpen={search} onRemove={toggleSaved} />}

        {isInitialLoad && !shipment && <ShipmentSkeleton />}

        {!isInitialLoad && error && !shipment && (
          <Text style={styles.error} accessibilityRole="alert">
            {tr("track.error")}
          </Text>
        )}

        {!isInitialLoad && hasSearched && !error && !shipment && data !== undefined && (
          <Text style={styles.empty} accessibilityRole="alert">
            {tr("track.notFound")}
          </Text>
        )}

        {shipment && (
          <View>
            <View style={styles.metaRow}>
              <Text style={styles.updated}>{updatedLabel ?? ""}</Text>
              <View style={styles.actions}>
                <Pressable
                  style={styles.shareButton}
                  onPress={() => toggleSaved(shipment.trackingId)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSaved(shipment.trackingId) }}
                  accessibilityLabel={isSaved(shipment.trackingId) ? tr("track.unsaveLabel") : tr("track.saveLabel")}
                >
                  <Ionicons name={isSaved(shipment.trackingId) ? "bookmark" : "bookmark-outline"} size={16} color={t.text} />
                  <Text style={styles.shareText}>{isSaved(shipment.trackingId) ? tr("track.saved") : tr("track.save")}</Text>
                </Pressable>
                <Pressable
                  style={styles.shareButton}
                  onPress={handleRoute}
                  hitSlop={8}
                  accessibilityRole="link"
                  accessibilityLabel={tr("track.routeLabel")}
                >
                  <Ionicons name="map-outline" size={16} color={t.text} />
                  <Text style={styles.shareText}>{tr("track.route")}</Text>
                </Pressable>
                <Pressable
                  style={styles.shareButton}
                  onPress={handleShare}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={tr("track.shareLabel")}
                >
                  <Ionicons name="share-outline" size={16} color={t.text} />
                  <Text style={styles.shareText}>{tr("track.share")}</Text>
                </Pressable>
              </View>
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
    titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    title: { fontSize: 24, fontWeight: "700", flexShrink: 1 },
    langButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: t.surfaceAlt,
    },
    langText: { fontSize: 13, fontWeight: "600" },
    subtitle: { fontSize: 14, color: t.textMuted, marginTop: 4, marginBottom: 20 },
    searchRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
    recentRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
    recentChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: t.surfaceAlt,
    },
    recentText: { fontSize: 12, fontWeight: "500", color: t.textMuted },
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
    actions: { flexDirection: "row", alignItems: "center", gap: 16 },
    shareButton: { flexDirection: "row", alignItems: "center", gap: 6 },
    shareText: { fontSize: 13, fontWeight: "600" },
  });
