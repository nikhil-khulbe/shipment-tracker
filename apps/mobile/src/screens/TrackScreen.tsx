import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useLazyQuery } from "@apollo/client/react";
import { SHIPMENT_QUERY } from "../graphql/queries";
import { ShipmentHeaderCard } from "../components/ShipmentHeaderCard";
import { ShipmentSkeleton } from "../components/Skeleton";
import { Timeline } from "../components/Timeline";
import { Text, TextInput } from "../components/ui";
import { feedback } from "../feedback";
import { useTheme, type Theme } from "../theme/theme";
import type { Shipment } from "../types";

export function TrackScreen() {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  const [trackingId, setTrackingId] = useState("");
  const [searchedId, setSearchedId] = useState<string | null>(null);
  const [runQuery, { data, loading, error, refetch }] = useLazyQuery<{ shipment: Shipment | null }>(
    SHIPMENT_QUERY,
    { fetchPolicy: "network-only" },
  );

  async function handleTrack() {
    const trimmed = trackingId.trim();
    if (!trimmed) return;
    setSearchedId(trimmed);
    const result = await runQuery({ variables: { trackingId: trimmed } });
    if (result.data?.shipment) feedback.tracked();
  }

  async function handleRefresh() {
    if (searchedId) await refetch?.();
  }

  const hasSearched = searchedId !== null;
  const shipment = data?.shipment ?? null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={loading && hasSearched && !!shipment} onRefresh={handleRefresh} />
        }
      >
        <Text style={styles.title}>Track a shipment</Text>
        <Text style={styles.subtitle}>Enter the tracking ID from your receipt.</Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            placeholder="e.g. SHP-7K2M9QXZ"
            autoCapitalize="characters"
            autoCorrect={false}
            value={trackingId}
            onChangeText={setTrackingId}
            onSubmitEditing={handleTrack}
            returnKeyType="search"
          />
          <Pressable style={styles.button} onPress={handleTrack}>
            <Text style={styles.buttonText}>Track</Text>
          </Pressable>
        </View>

        {loading && !shipment && <ShipmentSkeleton />}

        {!loading && error && (
          <Text style={styles.error}>Something went wrong reaching the server. Pull down to retry.</Text>
        )}

        {!loading && hasSearched && !error && !shipment && (
          <Text style={styles.empty}>No shipment found for that tracking ID.</Text>
        )}

        {shipment && (
          <View>
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
  });
