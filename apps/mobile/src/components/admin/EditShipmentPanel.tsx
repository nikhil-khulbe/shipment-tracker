import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useMutation } from "@apollo/client/react";
import { EDIT_SHIPMENT_MUTATION } from "../../graphql/mutations";
import { etaInDays } from "../../eta";
import { feedback } from "../../feedback";
import { useTheme } from "../../theme/theme";
import { PACKAGE_TYPES, type PackageType, type Shipment } from "../../types";
import { Text, TextInput } from "../ui";
import { makeAdminStyles } from "./adminStyles";

const ETA_OPTIONS = [
  { days: 1, label: "Tomorrow" },
  { days: 2, label: "2 days" },
  { days: 3, label: "3 days" },
  { days: 5, label: "5 days" },
  { days: 7, label: "1 week" },
];

type EtaChoice = "keep" | "clear" | number;

const FIELD_LABELS: Record<string, string> = {
  origin: "Origin",
  destination: "Destination",
  receiverName: "Receiver",
  receiverPhone: "Phone",
  senderName: "Sender",
  packageType: "Package type",
  weightKg: "Weight",
  description: "Description",
  estimatedDelivery: "Delivery date",
};

function shortValue(field: string, value: string | null | undefined): string {
  if (!value) return "none";
  if (field === "estimatedDelivery") return new Date(value).toLocaleDateString();
  return value;
}

/**
 * Admin: fix a typo or change the delivery date on an unfinished shipment.
 * Only the fields that actually changed are sent. Below the form, the log of
 * past edits (who changed what), as recorded by the server.
 */
export function EditShipmentPanel({ shipment }: { shipment: Shipment }) {
  const t = useTheme();
  const s = useMemo(() => makeAdminStyles(t), [t]);
  const [open, setOpen] = useState(false);

  const [origin, setOrigin] = useState(shipment.origin);
  const [destination, setDestination] = useState(shipment.destination);
  const [receiverName, setReceiverName] = useState(shipment.receiverName);
  const [receiverPhone, setReceiverPhone] = useState(shipment.receiverPhone ?? "");
  const [senderName, setSenderName] = useState(shipment.senderName ?? "");
  const [packageType, setPackageType] = useState<PackageType | null>(shipment.packageType ?? null);
  const [weight, setWeight] = useState(shipment.weightKg != null ? String(shipment.weightKg) : "");
  const [description, setDescription] = useState(shipment.description ?? "");
  const [eta, setEta] = useState<EtaChoice>("keep");
  const [formError, setFormError] = useState<string | null>(null);

  const [editShipment, { loading, error }] = useMutation<{ editShipment: Shipment }>(EDIT_SHIPMENT_MUTATION, {
    refetchQueries: ["Shipment", "Shipments"],
  });

  const edits = shipment.edits ?? [];
  const isFinal = (shipment.allowedNextStatuses ?? []).length === 0;

  async function handleSave() {
    const input: Record<string, unknown> = {};
    const required = { origin, destination, receiverName } as const;
    for (const [field, value] of Object.entries(required)) {
      const next = value.trim();
      if (!next) {
        setFormError(`${FIELD_LABELS[field]} can't be empty.`);
        return;
      }
      if (next !== (shipment as unknown as Record<string, string>)[field]) input[field] = next;
    }

    const optionalText = { receiverPhone, senderName, description } as const;
    for (const [field, value] of Object.entries(optionalText)) {
      const next = value.trim();
      const before = ((shipment as unknown as Record<string, string | null | undefined>)[field] ?? "").trim();
      if (next !== before) input[field] = next || null;
    }

    if (packageType !== (shipment.packageType ?? null)) input.packageType = packageType;

    const weightText = weight.trim();
    const weightNumber = weightText ? Number(weightText) : null;
    if (weightNumber !== null && (!Number.isFinite(weightNumber) || weightNumber <= 0)) {
      setFormError("Weight must be a number greater than 0.");
      return;
    }
    if (weightNumber !== (shipment.weightKg ?? null)) input.weightKg = weightNumber;

    if (eta === "clear") input.estimatedDelivery = null;
    else if (typeof eta === "number") input.estimatedDelivery = etaInDays(eta);

    if (Object.keys(input).length === 0) {
      setFormError("Nothing has changed.");
      return;
    }
    setFormError(null);

    const result = await editShipment({ variables: { trackingId: shipment.trackingId, input } }).catch(() => null);
    if (result?.data?.editShipment) {
      feedback.success("Shipment updated");
      setEta("keep");
      setOpen(false);
    }
  }

  return (
    <View style={{ marginTop: 28 }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Edit shipment details"
      >
        <Text style={s.sectionTitle}>{open ? "▾" : "▸"} Edit details</Text>
      </Pressable>

      {open && isFinal && (
        <Text style={s.hint}>This shipment is finished, so its details can't be changed any more.</Text>
      )}

      {open && !isFinal && (
        <View>
          <Text style={s.label}>Origin</Text>
          <TextInput style={s.input} value={origin} onChangeText={setOrigin} />
          <Text style={s.label}>Destination</Text>
          <TextInput style={s.input} value={destination} onChangeText={setDestination} />
          <Text style={s.label}>Receiver name</Text>
          <TextInput style={s.input} value={receiverName} onChangeText={setReceiverName} />
          <Text style={s.label}>Receiver phone</Text>
          <TextInput style={s.input} keyboardType="phone-pad" value={receiverPhone} onChangeText={setReceiverPhone} />
          <Text style={s.label}>Sender name</Text>
          <TextInput style={s.input} value={senderName} onChangeText={setSenderName} />

          <Text style={s.label}>Package type</Text>
          <View style={s.chipRow}>
            {PACKAGE_TYPES.map((type) => {
              const on = packageType === type;
              return (
                <Pressable
                  key={type}
                  style={[s.chip, on && s.chipOn]}
                  onPress={() => setPackageType(on ? null : type)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.chipText, on && s.chipTextOn]}>{type}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={s.label}>Weight in kg</Text>
          <TextInput style={s.input} keyboardType="decimal-pad" value={weight} onChangeText={setWeight} />
          <Text style={s.label}>Description</Text>
          <TextInput style={s.input} value={description} onChangeText={setDescription} />

          <Text style={s.label}>
            Delivery date{shipment.estimatedDelivery ? ` (now ${new Date(shipment.estimatedDelivery).toLocaleDateString()})` : ""}
          </Text>
          <View style={s.chipRow}>
            {[{ key: "keep" as const, label: "Keep" }, ...ETA_OPTIONS.map((o) => ({ key: o.days, label: o.label })), { key: "clear" as const, label: "Clear" }].map(
              ({ key, label }) => {
                const on = eta === key;
                return (
                  <Pressable
                    key={String(key)}
                    style={[s.chip, on && s.chipOn]}
                    onPress={() => setEta(key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
                  </Pressable>
                );
              },
            )}
          </View>

          {(formError || error) && <Text style={s.error}>{formError ?? error?.message}</Text>}

          <Pressable style={s.primaryButton} onPress={handleSave} disabled={loading} accessibilityRole="button">
            {loading ? <ActivityIndicator color={t.onPrimary} /> : <Text style={s.primaryButtonText}>Save changes</Text>}
          </Pressable>
        </View>
      )}

      {edits.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={s.label}>Edit log</Text>
          {edits.map((edit, i) => (
            <View key={`${edit.at}-${i}`} style={{ marginBottom: 8 }}>
              <Text style={s.hint}>
                {new Date(edit.at).toLocaleString()}
                {edit.by ? ` · ${edit.by}` : ""}
              </Text>
              {edit.changes.map((c) => (
                <Text key={c.field} style={{ fontSize: 13 }}>
                  {FIELD_LABELS[c.field] ?? c.field}: {shortValue(c.field, c.from)} → {shortValue(c.field, c.to)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
