import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { labelQrText, printLabel } from "../../printLabel";
import { feedback } from "../../feedback";
import { useTheme, type Theme } from "../../theme/theme";
import type { Shipment } from "../../types";
import { QrCode } from "../QrCode";
import { Text } from "../ui";

/** Preview of the shipping label (tracking ID + QR code) with a Print button. */
export function LabelModal({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    setPrinting(true);
    try {
      const ok = await printLabel(shipment);
      if (!ok) feedback.error("Your browser blocked the print window. Allow pop-ups and try again.");
    } catch {
      feedback.error("Couldn't open the print dialog.");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.id}>{shipment.trackingId}</Text>
          <View style={styles.qr}>
            <QrCode value={labelQrText(shipment.trackingId)} size={190} />
          </View>
          <Text style={styles.route}>
            {shipment.origin} → {shipment.destination}
          </Text>
          <Text style={styles.sub}>To: {shipment.receiverName}</Text>
          <Text style={styles.hint}>Scanning the code opens the tracking page.</Text>

          <Pressable style={styles.primary} onPress={handlePrint} disabled={printing} accessibilityRole="button">
            <Text style={styles.primaryText}>{printing ? "Opening…" : "Print label"}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={onClose} accessibilityRole="button">
            <Text style={styles.secondaryText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 20 },
    card: { backgroundColor: t.bg, borderRadius: 16, padding: 22, width: "100%", maxWidth: 360, alignItems: "center" },
    id: { fontSize: 20, fontWeight: "700", letterSpacing: 1, marginBottom: 14 },
    qr: { borderWidth: 1, borderColor: t.border, borderRadius: 8, overflow: "hidden" },
    route: { fontSize: 16, fontWeight: "700", marginTop: 14 },
    sub: { fontSize: 14, color: t.textMuted, marginTop: 4 },
    hint: { fontSize: 12, color: t.textFaint, marginTop: 8 },
    primary: { backgroundColor: t.primary, borderRadius: 10, paddingVertical: 13, alignSelf: "stretch", alignItems: "center", marginTop: 18 },
    primaryText: { color: t.onPrimary, fontWeight: "600" },
    secondary: { paddingVertical: 12, alignSelf: "stretch", alignItems: "center" },
    secondaryText: { fontWeight: "600" },
  });
