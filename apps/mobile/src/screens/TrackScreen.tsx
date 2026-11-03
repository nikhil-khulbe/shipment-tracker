import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLazyQuery } from "@apollo/client/react";
import { SHIPMENT_QUERY } from "../graphql/queries";
import { ShipmentHeaderCard } from "../components/ShipmentHeaderCard";
import { Timeline } from "../components/Timeline";
import type { Shipment } from "../types";

export function TrackScreen() {
  const [trackingId, setTrackingId] = useState("");
  const [searchedId, setSearchedId] = useState<string | null>(null);
  const [runQuery, { data, loading, error, refetch }] = useLazyQuery<{ shipment: Shipment | null }>(
    SHIPMENT_QUERY,
    { fetchPolicy: "network-only" },
  );

  function handleTrack() {
    const trimmed = trackingId.trim();
    if (!trimmed) return;
    setSearchedId(trimmed);
    runQuery({ variables: { trackingId: trimmed } });
  }

  async function handleRefresh() {
    if (searchedId) await refetch?.();
  }

  const hasSearched = searchedId !== null;
  const shipment = data?.shipment ?? null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={loading && hasSearched} onRefresh={handleRefresh} />
        }
      >
        <Text style={styles.title}>Track a shipment</Text>
        <Text style={styles.subtitle}>Enter the tracking ID from your receipt.</Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            placeholder="e.g. SHP-7K2M9QXZ"
            placeholderTextColor="#9ca3af"
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

        {loading && !shipment && (
          <View style={styles.centered}>
            <ActivityIndicator />
          </View>
        )}

        {!loading && error && (
          <Text style={styles.error}>
            Something went wrong reaching the server. Pull down to retry.
          </Text>
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
    marginBottom: 20,
  },
  searchRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  button: {
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  centered: {
    paddingVertical: 40,
    alignItems: "center",
  },
  error: {
    color: "#dc2626",
    textAlign: "center",
    marginTop: 20,
  },
  empty: {
    color: "#6b7280",
    textAlign: "center",
    marginTop: 20,
  },
});
