import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useLazyQuery, useMutation, useQuery } from "@apollo/client/react";
import { ME_QUERY, SHIPMENT_QUERY } from "../graphql/queries";
import { CREATE_SHIPMENT_MUTATION, LOGIN_MUTATION, UPDATE_STATUS_MUTATION } from "../graphql/mutations";
import { getToken, saveToken, clearToken } from "../auth/token";
import { apolloClient } from "../apollo";
import { SHIPMENT_STATUSES, type Shipment, type ShipmentStatus } from "../types";

/** The one legal next step for each status; empty means terminal (DELIVERED). */
const NEXT_STATUS: Record<ShipmentStatus, ShipmentStatus | null> = {
  CREATED: "PICKED_UP",
  PICKED_UP: "IN_TRANSIT",
  IN_TRANSIT: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
  DELIVERED: null,
};

export function AdminScreen() {
  const [checkedStorage, setCheckedStorage] = useState(false);
  const [hasStoredToken, setHasStoredToken] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      setHasStoredToken(Boolean(token));
      setCheckedStorage(true);
    })();
  }, []);

  const {
    data: meData,
    loading: meLoading,
    error: meError,
  } = useQuery<{ me: { id: string; email: string } | null }>(ME_QUERY, {
    skip: !checkedStorage || !hasStoredToken,
    fetchPolicy: "network-only",
  });

  async function handleLoggedIn() {
    setHasStoredToken(true);
  }

  async function handleLogout() {
    await clearToken();
    await apolloClient.resetStore();
    setHasStoredToken(false);
  }

  if (!checkedStorage || (hasStoredToken && meLoading)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const isLoggedIn = hasStoredToken && !meError && meData?.me != null;

  if (!isLoggedIn) {
    return <LoginForm onLoggedIn={handleLoggedIn} />;
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.header}>
          <Text style={styles.title}>Admin</Text>
          <Pressable onPress={handleLogout}>
            <Text style={styles.logout}>Log out</Text>
          </Pressable>
        </View>
        <Text style={styles.signedInAs}>{meData?.me?.email}</Text>

        <CreateShipmentForm />
        <View style={styles.divider} />
        <UpdateStatusForm />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [login, { loading, error }] = useMutation<{
    login: { token: string; email: string; expiresIn: number };
  }>(LOGIN_MUTATION);

  async function handleSubmit() {
    const result = await login({ variables: { email: email.trim(), password } }).catch(() => null);
    const token = result?.data?.login?.token;
    if (token) {
      await saveToken(token);
      onLoggedIn();
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <View style={styles.loginContainer}>
        <Text style={styles.title}>Admin login</Text>
        <Text style={styles.subtitle}>Sign in to create shipments and update their status.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleSubmit}
        />

        {error && <Text style={styles.error}>{error.message}</Text>}

        <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Log in</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function CreateShipmentForm() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [createShipment, { loading, error }] = useMutation<{ createShipment: Shipment }>(
    CREATE_SHIPMENT_MUTATION,
    { refetchQueries: ["Shipment"] },
  );
  const [createdTrackingId, setCreatedTrackingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!createdTrackingId) return;
    await Clipboard.setStringAsync(createdTrackingId);
    setCopied(true);
  }

  async function handleSubmit() {
    const result = await createShipment({
      variables: { input: { origin: origin.trim(), destination: destination.trim(), receiverName: receiverName.trim() } },
    }).catch(() => null);

    const created: Shipment | undefined = result?.data?.createShipment;
    if (created) {
      setCreatedTrackingId(created.trackingId);
      setCopied(false);
      setOrigin("");
      setDestination("");
      setReceiverName("");
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Create a shipment</Text>

      <Text style={styles.label}>Origin</Text>
      <TextInput style={styles.input} value={origin} onChangeText={setOrigin} placeholder="Delhi" />

      <Text style={styles.label}>Destination</Text>
      <TextInput style={styles.input} value={destination} onChangeText={setDestination} placeholder="Mumbai" />

      <Text style={styles.label}>Receiver name</Text>
      <TextInput style={styles.input} value={receiverName} onChangeText={setReceiverName} placeholder="Asha Rao" />

      {error && <Text style={styles.error}>{error.message}</Text>}

      <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Create shipment</Text>}
      </Pressable>

      {createdTrackingId && (
        <Pressable style={styles.successBanner} onPress={handleCopy}>
          <Text style={styles.successLabel}>
            {copied ? "Copied to clipboard" : "Created. Tap the ID to copy it:"}
          </Text>
          <Text style={styles.successValue}>{createdTrackingId}</Text>
        </Pressable>
      )}
    </View>
  );
}

function UpdateStatusForm() {
  const [trackingId, setTrackingId] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");

  const [loadShipment, { data, loading: loadingShipment, error: loadError }] = useLazyQuery<{
    shipment: Shipment | null;
  }>(SHIPMENT_QUERY, { fetchPolicy: "network-only" });

  const [updateStatus, { loading: updating, error: updateError }] = useMutation<{
    updateStatus: Shipment;
  }>(UPDATE_STATUS_MUTATION, {
    refetchQueries: ["Shipment"],
  });

  const shipment = data?.shipment ?? null;
  const nextStatus = shipment ? NEXT_STATUS[shipment.currentStatus] : null;

  function handleLoad() {
    const trimmed = trackingId.trim();
    if (!trimmed) return;
    loadShipment({ variables: { trackingId: trimmed } });
  }

  async function handleAdvance() {
    if (!shipment || !nextStatus) return;
    const result = await updateStatus({
      variables: {
        input: {
          trackingId: shipment.trackingId,
          status: nextStatus,
          location: location.trim() || shipment.destination,
          note: note.trim() || null,
        },
      },
    }).catch(() => null);

    if (result?.data?.updateStatus) {
      setLocation("");
      setNote("");
      // Re-run the lookup so the chip row reflects the new current status.
      loadShipment({ variables: { trackingId: shipment.trackingId } });
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Update a shipment's status</Text>

      <Text style={styles.label}>Tracking ID</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.input, styles.flex]}
          autoCapitalize="characters"
          value={trackingId}
          onChangeText={setTrackingId}
          onSubmitEditing={handleLoad}
          placeholder="e.g. SHP-7K2M9QXZ"
        />
        <Pressable style={styles.secondaryButton} onPress={handleLoad}>
          <Text style={styles.secondaryButtonText}>Load</Text>
        </Pressable>
      </View>

      {loadingShipment && <ActivityIndicator style={styles.spacingTop} />}
      {!loadingShipment && loadError && <Text style={styles.error}>Couldn't reach the server.</Text>}
      {!loadingShipment && data !== undefined && !shipment && (
        <Text style={styles.error}>No shipment found for that tracking ID.</Text>
      )}

      {shipment && (
        <View style={styles.spacingTop}>
          <View style={styles.chipRow}>
            {SHIPMENT_STATUSES.map((status) => {
              const isCurrent = status === shipment.currentStatus;
              const isNext = status === nextStatus;
              return (
                <View
                  key={status}
                  style={[
                    styles.chip,
                    isCurrent && styles.chipCurrent,
                    isNext && styles.chipNext,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isCurrent && styles.chipTextCurrent,
                      isNext && styles.chipTextNext,
                    ]}
                  >
                    {status.replace(/_/g, " ")}
                  </Text>
                </View>
              );
            })}
          </View>

          {nextStatus ? (
            <>
              <Text style={styles.label}>Location</Text>
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                placeholder={shipment.destination}
              />

              <Text style={styles.label}>Note (optional)</Text>
              <TextInput style={styles.input} value={note} onChangeText={setNote} />

              {updateError && <Text style={styles.error}>{updateError.message}</Text>}

              <Pressable style={styles.primaryButton} onPress={handleAdvance} disabled={updating}>
                {updating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Advance to {nextStatus.replace(/_/g, " ")}
                  </Text>
                )}
              </Pressable>
            </>
          ) : (
            <Text style={styles.spacingTop}>This shipment has already been delivered.</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 120 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 14, color: "#6b7280", marginTop: 4, marginBottom: 20 },
  signedInAs: { fontSize: 13, color: "#6b7280", marginBottom: 24 },
  logout: { color: "#dc2626", fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 18,
  },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#111827",
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  secondaryButtonText: { color: "#111827", fontWeight: "600" },
  error: { color: "#dc2626", marginTop: 10 },
  loginContainer: { flex: 1, justifyContent: "center", padding: 24 },
  section: { marginBottom: 8 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#111827", marginBottom: 4 },
  divider: { height: 1, backgroundColor: "#e5e7eb", marginVertical: 28 },
  searchRow: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  spacingTop: { marginTop: 14 },
  successBanner: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#16a34a",
  },
  successLabel: { fontSize: 12, color: "#166534" },
  successValue: { fontSize: 18, fontWeight: "700", color: "#166534", marginTop: 4, letterSpacing: 0.5 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  chipCurrent: { backgroundColor: "#e5e7eb", borderColor: "#9ca3af" },
  chipNext: { backgroundColor: "#111827", borderColor: "#111827" },
  chipText: { fontSize: 12, color: "#9ca3af", fontWeight: "600" },
  chipTextCurrent: { color: "#374151" },
  chipTextNext: { color: "#fff" },
});
