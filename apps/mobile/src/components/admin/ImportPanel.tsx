import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useMutation } from "@apollo/client/react";
import { IMPORT_SHIPMENTS_MUTATION } from "../../graphql/mutations";
import { CSV_TEMPLATE, parseShipmentsCsv } from "../../csv";
import { feedback } from "../../feedback";
import { useTheme } from "../../theme/theme";
import { Text, TextInput } from "../ui";
import { makeAdminStyles } from "./adminStyles";

type ImportResult = { row: number; ok: boolean; error: string | null; trackingId: string | null };

/** Admin: paste a CSV, check it, create the shipments in one go. */
export function ImportPanel() {
  const t = useTheme();
  const s = useMemo(() => makeAdminStyles(t), [t]);
  const [text, setText] = useState("");
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const [runImport, { loading, error }] = useMutation<{ importShipments: ImportResult[] }>(IMPORT_SHIPMENTS_MUTATION, {
    refetchQueries: ["Shipments", "Dashboard"],
  });

  const parsed = useMemo(() => (text.trim() ? parseShipmentsCsv(text) : null), [text]);
  const canImport = parsed !== null && parsed.rows.length > 0 && !loading;

  async function handleImport() {
    if (!parsed || parsed.rows.length === 0) return;
    const response = await runImport({ variables: { inputs: parsed.rows } }).catch(() => null);
    const list = response?.data?.importShipments;
    if (!list) return;
    setResults(list);
    const created = list.filter((r) => r.ok).length;
    if (created > 0) feedback.success(`Created ${created} shipment${created === 1 ? "" : "s"}`);
    if (created === list.length) setText("");
  }

  // Server rows are numbered among the rows we sent; map back to the file line.
  const lineFor = (row: number) => parsed?.lines[row - 1] ?? row;
  const failed = results?.filter((r) => !r.ok) ?? [];
  const created = results?.filter((r) => r.ok) ?? [];

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Import shipments</Text>
      <Text style={s.hint}>
        Paste CSV with a header row. Required columns: origin, destination, receiverName. Optional: receiverPhone,
        senderName, packageType, weightKg, description, estimatedDelivery (YYYY-MM-DD). Up to 200 rows.
      </Text>

      <Pressable
        style={s.secondaryButton}
        onPress={() => {
          setText(CSV_TEMPLATE);
          setResults(null);
        }}
        accessibilityRole="button"
      >
        <Text style={s.secondaryButtonText}>Fill in an example</Text>
      </Pressable>

      <Text style={s.label}>CSV</Text>
      <TextInput
        style={[s.input, s.multiline]}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setResults(null);
        }}
        placeholder={"origin,destination,receiverName\nDelhi,Mumbai,Asha Rao"}
        accessibilityLabel="CSV data"
      />

      {parsed && (
        <View style={{ marginTop: 10 }}>
          <Text style={parsed.rows.length > 0 ? s.success : s.error}>
            {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} ready
            {parsed.problems.length > 0 ? `, ${parsed.problems.length} with problems (will be skipped)` : ""}
          </Text>
          {parsed.problems.slice(0, 6).map((problem, i) => (
            <Text key={i} style={s.hint}>
              Line {problem.line}: {problem.message}
            </Text>
          ))}
          {parsed.problems.length > 6 && <Text style={s.hint}>…and {parsed.problems.length - 6} more.</Text>}
        </View>
      )}

      {error && <Text style={s.error}>{error.message}</Text>}

      <Pressable
        style={[s.primaryButton, !canImport && { opacity: 0.5 }]}
        onPress={handleImport}
        disabled={!canImport}
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator color={t.onPrimary} />
        ) : (
          <Text style={s.primaryButtonText}>
            {parsed && parsed.rows.length > 0 ? `Import ${parsed.rows.length} shipment${parsed.rows.length === 1 ? "" : "s"}` : "Import"}
          </Text>
        )}
      </Pressable>

      {results && (
        <View style={{ marginTop: 16 }}>
          <Text style={created.length > 0 ? s.success : s.error}>
            Created {created.length} of {results.length}.
          </Text>
          {failed.map((r) => (
            <Text key={r.row} style={s.error}>
              Line {lineFor(r.row)}: {r.error}
            </Text>
          ))}
          {created.length > 0 && (
            <Text style={s.hint} selectable>
              New IDs: {created.map((r) => r.trackingId).join(", ")}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
