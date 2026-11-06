import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useLazyQuery, useMutation, useQuery } from "@apollo/client/react";
import { AUTH_REQUIRED_QUERY, ME_QUERY, SHIPMENT_QUERY } from "../graphql/queries";
import { CREATE_SHIPMENT_MUTATION, LOGIN_MUTATION, UPDATE_STATUS_MUTATION } from "../graphql/mutations";
import { getToken, saveToken, clearToken } from "../auth/token";
import { onSessionExpired } from "../auth/session";
import { apolloClient } from "../apollo";
import { clearPersistedCache } from "../cachePersist";
import { ShipmentList } from "../components/ShipmentList";
import { Text, TextInput } from "../components/ui";
import { feedback } from "../feedback";
import { STATUS_LABELS } from "../theme/status";
import { useTheme, type Theme } from "../theme/theme";
import { etaInDays } from "../eta";
import { isExceptionStatus, PACKAGE_TYPES, type PackageType, type Shipment, type ShipmentStatus } from "../types";
import { StatusBadge } from "../components/StatusBadge";

const ETA_OPTIONS = [
  { days: 1, label: "Tomorrow" },
  { days: 2, label: "2 days" },
  { days: 3, label: "3 days" },
  { days: 5, label: "5 days" },
  { days: 7, label: "1 week" },
];

type Section = "list" | "create" | "update";
const SECTIONS: { key: Section; label: string }[] = [
  { key: "list", label: "Shipments" },
  { key: "create", label: "New" },
  { key: "update", label: "Update" },
];

/**
 * Gate in front of the admin dashboard. The server decides whether a login
 * is needed (`authRequired`): in open demo mode the dashboard shows
 * straight away, otherwise a stored, still-valid admin token is required.
 */
export function AdminScreen() {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [checkedStorage, setCheckedStorage] = useState(false);
  const [hasStoredToken, setHasStoredToken] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      setHasStoredToken(Boolean(token));
      setCheckedStorage(true);
    })();
  }, []);

  // The Apollo error link fires this the moment any request comes back
  // UNAUTHENTICATED (expired / tampered token, deleted admin).
  useEffect(
    () =>
      onSessionExpired(() => {
        setHasStoredToken(false);
        feedback.error("Session expired — please log in again");
      }),
    [],
  );

  const {
    data: authData,
    loading: authLoading,
    refetch: refetchAuthRequired,
  } = useQuery<{ authRequired: boolean }>(AUTH_REQUIRED_QUERY, { fetchPolicy: "cache-and-network" });
  // Unknown (server unreachable, nothing cached) is treated as "required":
  // showing a login form is safe; showing admin tools would not be.
  const authRequired = authData?.authRequired ?? true;

  const {
    data: meData,
    loading: meLoading,
    error: meError,
  } = useQuery<{ me: { id: string; email: string } | null }>(ME_QUERY, {
    skip: !checkedStorage || !hasStoredToken || !authRequired,
    fetchPolicy: "network-only",
  });

  async function handleLogout() {
    await clearToken();
    await apolloClient.resetStore();
    await clearPersistedCache();
    setHasStoredToken(false);
  }

  if (!checkedStorage || (authLoading && !authData) || (authRequired && hasStoredToken && meLoading)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={t.text} />
      </View>
    );
  }

  if (!authData) {
    return (
      <View style={styles.centered}>
        <Text style={styles.subtitle}>Can't reach the server.</Text>
        <Pressable onPress={() => refetchAuthRequired().catch(() => null)}>
          <Text style={styles.logout}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (authRequired) {
    const isLoggedIn = hasStoredToken && !meError && meData?.me != null;
    if (!isLoggedIn) {
      return <LoginForm onLoggedIn={() => setHasStoredToken(true)} />;
    }
    return <AdminDashboard email={meData?.me?.email} onLogout={handleLogout} />;
  }

  return <AdminDashboard />;
}

function AdminDashboard({ email, onLogout }: { email?: string; onLogout?: () => void }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [section, setSection] = useState<Section>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function openForUpdate(trackingId: string) {
    setSelectedId(trackingId);
    setSection("update");
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <View style={styles.adminHeader}>
        <View style={styles.header}>
          <Text style={styles.title}>Admin</Text>
          {onLogout && (
            <Pressable onPress={onLogout}>
              <Text style={styles.logout}>Log out</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.signedInAs}>{email ?? "Create shipments and update their status."}</Text>

        <View style={styles.segments}>
          {SECTIONS.map(({ key, label }) => (
            <Pressable
              key={key}
              style={[styles.segment, section === key && styles.segmentActive]}
              onPress={() => setSection(key)}
            >
              <Text style={[styles.segmentText, section === key && styles.segmentTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {section === "list" ? (
        <ShipmentList onSelect={openForUpdate} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {section === "create" ? <CreateShipmentForm /> : <UpdateStatusForm initialTrackingId={selectedId} />}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
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
          {loading ? <ActivityIndicator color={t.onPrimary} /> : <Text style={styles.primaryButtonText}>Log in</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function CreateShipmentForm() {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [packageType, setPackageType] = useState<PackageType | null>(null);
  const [weight, setWeight] = useState("");
  const [description, setDescription] = useState("");
  const [etaDays, setEtaDays] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [createShipment, { loading, error }] = useMutation<{ createShipment: Shipment }>(
    CREATE_SHIPMENT_MUTATION,
    { refetchQueries: ["Shipment", "Shipments"] },
  );
  const [createdTrackingId, setCreatedTrackingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!createdTrackingId) return;
    await Clipboard.setStringAsync(createdTrackingId);
    setCopied(true);
    feedback.success("Tracking ID copied");
  }

  async function handleSubmit() {
    // Weight is typed as text; reject junk here rather than send NaN to the API.
    const weightKg = weight.trim() ? Number(weight.trim()) : null;
    if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg <= 0)) {
      setFormError("Weight must be a number greater than 0.");
      return;
    }
    setFormError(null);

    const result = await createShipment({
      variables: {
        input: {
          origin: origin.trim(),
          destination: destination.trim(),
          receiverName: receiverName.trim(),
          senderName: senderName.trim() || null,
          receiverPhone: receiverPhone.trim() || null,
          packageType,
          weightKg,
          description: description.trim() || null,
          estimatedDelivery: etaDays !== null ? etaInDays(etaDays) : null,
        },
      },
    }).catch(() => null);

    const created: Shipment | undefined = result?.data?.createShipment;
    if (created) {
      setCreatedTrackingId(created.trackingId);
      setCopied(false);
      feedback.success("Shipment created");
      setOrigin("");
      setDestination("");
      setReceiverName("");
      setSenderName("");
      setReceiverPhone("");
      setPackageType(null);
      setWeight("");
      setDescription("");
      setEtaDays(null);
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

      <Text style={styles.label}>Receiver phone (optional)</Text>
      <TextInput
        style={styles.input}
        keyboardType="phone-pad"
        value={receiverPhone}
        onChangeText={setReceiverPhone}
        placeholder="+91 98765 43210"
      />

      <Text style={styles.label}>Sender name (optional)</Text>
      <TextInput style={styles.input} value={senderName} onChangeText={setSenderName} placeholder="Ravi Kumar" />

      <Text style={styles.label}>Package type (optional)</Text>
      <View style={styles.chipRow}>
        {PACKAGE_TYPES.map((type) => {
          const selected = packageType === type;
          return (
            <Pressable
              key={type}
              style={[styles.chip, selected && styles.chipNext]}
              onPress={() => setPackageType(selected ? null : type)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextNext]}>{type}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Weight in kg (optional)</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={weight}
        onChangeText={setWeight}
        placeholder="2.5"
      />

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Glassware" />

      <Text style={styles.label}>Expected delivery (optional)</Text>
      <View style={styles.chipRow}>
        {ETA_OPTIONS.map(({ days, label }) => {
          const selected = etaDays === days;
          return (
            <Pressable
              key={days}
              style={[styles.chip, selected && styles.chipNext]}
              onPress={() => setEtaDays(selected ? null : days)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextNext]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {(formError || error) && <Text style={styles.error}>{formError ?? error?.message}</Text>}

      <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color={t.onPrimary} /> : <Text style={styles.primaryButtonText}>Create shipment</Text>}
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

function UpdateStatusForm({ initialTrackingId }: { initialTrackingId: string | null }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [trackingId, setTrackingId] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [chosen, setChosen] = useState<ShipmentStatus | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [loadShipment, { data, loading: loadingShipment, error: loadError }] = useLazyQuery<{
    shipment: Shipment | null;
  }>(SHIPMENT_QUERY, { fetchPolicy: "network-only" });

  const [updateStatus, { loading: updating, error: updateError }] = useMutation<{
    updateStatus: Shipment;
  }>(UPDATE_STATUS_MUTATION, {
    refetchQueries: ["Shipment", "Shipments"],
  });

  // Arrived here by tapping a row in the list: fill the ID and load it.
  useEffect(() => {
    if (!initialTrackingId) return;
    setTrackingId(initialTrackingId);
    loadShipment({ variables: { trackingId: initialTrackingId } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTrackingId]);

  const shipment = data?.shipment ?? null;
  // The API owns the rules: it says which moves are legal from here.
  const options = shipment?.allowedNextStatuses ?? [];
  const nextStatus = chosen !== null && options.includes(chosen) ? chosen : null;

  // When a different shipment (or a new status) loads, pre-select the main-path
  // step if there is one, so the common case is a single tap on the button.
  useEffect(() => {
    const first = options.find((s) => !isExceptionStatus(s)) ?? null;
    setChosen(first);
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment?.trackingId, shipment?.currentStatus]);

  function handleLoad() {
    const trimmed = trackingId.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    loadShipment({ variables: { trackingId: trimmed } });
  }

  async function handleAdvance() {
    if (!shipment || !nextStatus) return;
    const eventLocation = location.trim() || shipment.destination;
    const eventNote = note.trim() || null;
    if (isExceptionStatus(nextStatus) && !eventNote) {
      setFormError("Please say why (the reason is shown to anyone tracking this shipment).");
      return;
    }
    setFormError(null);
    const result = await updateStatus({
      variables: {
        input: {
          trackingId: shipment.trackingId,
          status: nextStatus,
          location: eventLocation,
          note: eventNote,
        },
      },
      // Optimistic UI: assume the server accepts the move and write the
      // predicted shipment into a temporary cache layer, so the chips and
      // the Track tab update instantly. If the server rejects it, Apollo
      // discards that layer and everything snaps back — no manual undo.
      optimisticResponse: {
        updateStatus: {
          ...shipment,
          currentStatus: nextStatus,
          allowedNextStatuses: [] as ShipmentStatus[], // the server's answer replaces this in a moment
          history: [
            ...shipment.history,
            {
              __typename: "StatusEvent" as const,
              status: nextStatus,
              location: eventLocation,
              note: eventNote,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      },
    }).catch((e: Error) => {
      feedback.error(e.message || "Couldn't update the shipment");
      return null;
    });

    if (result?.data?.updateStatus) {
      feedback.success(`Status updated to ${STATUS_LABELS[nextStatus]}`);
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

      {loadingShipment && <ActivityIndicator color={t.text} style={styles.spacingTop} />}
      {!loadingShipment && loadError && <Text style={styles.error}>Couldn't reach the server.</Text>}
      {!loadingShipment && data !== undefined && !shipment && (
        <Text style={styles.error}>No shipment found for that tracking ID.</Text>
      )}

      {shipment && (
        <View style={styles.spacingTop}>
          <Text style={styles.label}>Current status</Text>
          <View style={styles.chipRow}>
            <StatusBadge status={shipment.currentStatus} />
          </View>

          {options.length > 0 ? (
            <>
              <Text style={styles.label}>Move to</Text>
              <View style={styles.chipRow}>
                {options.map((status) => {
                  const selected = status === nextStatus;
                  return (
                    <Pressable
                      key={status}
                      style={[styles.chip, selected && styles.chipNext]}
                      onPress={() => setChosen(status)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextNext]}>
                        {STATUS_LABELS[status]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Location</Text>
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                placeholder={shipment.destination}
              />

              <Text style={styles.label}>
                {nextStatus && isExceptionStatus(nextStatus) ? "Reason (required)" : "Note (optional)"}
              </Text>
              <TextInput style={styles.input} value={note} onChangeText={setNote} />

              {(formError || updateError) && <Text style={styles.error}>{formError ?? updateError?.message}</Text>}

              <Pressable style={styles.primaryButton} onPress={handleAdvance} disabled={updating || !nextStatus}>
                {updating ? (
                  <ActivityIndicator color={t.onPrimary} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {nextStatus ? `Move to ${STATUS_LABELS[nextStatus]}` : "Choose a status"}
                  </Text>
                )}
              </Pressable>
            </>
          ) : (
            <Text style={styles.spacingTop}>
              This shipment is {STATUS_LABELS[shipment.currentStatus].toLowerCase()} and can't be changed any more.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: t.bg },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },
    content: { padding: 20, paddingBottom: 120 },
    adminHeader: { paddingHorizontal: 20, paddingTop: 20 },
    segments: {
      flexDirection: "row",
      backgroundColor: t.surfaceAlt,
      borderRadius: 10,
      padding: 3,
      marginBottom: 14,
    },
    segment: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8 },
    segmentActive: { backgroundColor: t.bg },
    segmentText: { fontSize: 13, fontWeight: "600", color: t.textMuted },
    segmentTextActive: { color: t.text },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    title: { fontSize: 24, fontWeight: "700" },
    subtitle: { fontSize: 14, color: t.textMuted, marginTop: 4, marginBottom: 20 },
    signedInAs: { fontSize: 13, color: t.textMuted, marginBottom: 24 },
    logout: { color: t.danger, fontWeight: "600" },
    label: { fontSize: 13, fontWeight: "600", color: t.textMuted, marginBottom: 6, marginTop: 14 },
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
    },
    primaryButton: {
      backgroundColor: t.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 18,
    },
    primaryButtonText: { color: t.onPrimary, fontWeight: "600", fontSize: 15 },
    secondaryButton: {
      borderWidth: 1,
      borderColor: t.text,
      borderRadius: 10,
      paddingHorizontal: 16,
      justifyContent: "center",
    },
    secondaryButtonText: { fontWeight: "600" },
    error: { color: t.danger, marginTop: 10 },
    loginContainer: { flex: 1, justifyContent: "center", padding: 24 },
    section: { marginBottom: 8 },
    sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
    divider: { height: 1, backgroundColor: t.border, marginVertical: 28 },
    searchRow: { flexDirection: "row", gap: 10, alignItems: "stretch" },
    spacingTop: { marginTop: 14 },
    successBanner: {
      marginTop: 16,
      padding: 14,
      borderRadius: 10,
      backgroundColor: t.successBg,
      borderWidth: 1,
      borderColor: t.success,
    },
    successLabel: { fontSize: 12, color: t.success },
    successValue: { fontSize: 18, fontWeight: "700", color: t.success, marginTop: 4, letterSpacing: 0.5 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: t.surfaceAlt,
      borderWidth: 1,
      borderColor: t.border,
    },
    chipCurrent: { borderColor: t.textMuted },
    chipNext: { backgroundColor: t.primary, borderColor: t.primary },
    chipText: { fontSize: 12, color: t.textFaint, fontWeight: "600" },
    chipTextCurrent: { color: t.text },
    chipTextNext: { color: t.onPrimary },
  });
