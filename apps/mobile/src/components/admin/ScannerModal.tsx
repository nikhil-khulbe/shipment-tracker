import { useMemo, useRef } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { extractTrackingId } from "../../scan";
import { feedback } from "../../feedback";
import { useTheme, type Theme } from "../../theme/theme";
import { Text } from "../ui";

/**
 * Camera scanner for the QR code on a label (or a barcode with the tracking
 * ID). Calls `onScan` once with the ID, then the parent closes the modal.
 */
export function ScannerModal({ onScan, onClose }: { onScan: (trackingId: string) => void; onClose: () => void }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [permission, requestPermission] = useCameraPermissions();
  // The camera fires many frames per second for the same code; act on the first valid one only.
  const handled = useRef(false);
  const lastRejected = useRef<string>("");

  function handleScanned({ data }: { data: string }) {
    if (handled.current) return;
    const id = extractTrackingId(data);
    if (!id) {
      if (lastRejected.current !== data) {
        lastRejected.current = data;
        feedback.error("That code isn't a shipment tracking ID");
      }
      return;
    }
    handled.current = true;
    onScan(id);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {permission === null ? null : !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.message}>
              {permission.canAskAgain
                ? "Allow camera access to scan shipping labels."
                : "Camera access is blocked. Enable it in your settings to scan labels."}
            </Text>
            {permission.canAskAgain && (
              <Pressable style={styles.primary} onPress={requestPermission} accessibilityRole="button">
                <Text style={styles.primaryText}>Allow camera</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr", "code128"] }}
            onBarcodeScanned={handleScanned}
          />
        )}
        <View style={styles.overlay} pointerEvents="box-none">
          <Text style={styles.hint}>Point the camera at the label's QR code</Text>
          <Pressable style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close scanner">
            <Text style={styles.closeText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 16 },
    message: { color: "#fff", textAlign: "center", fontSize: 15 },
    primary: { backgroundColor: t.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 22 },
    primaryText: { color: t.onPrimary, fontWeight: "600" },
    overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "space-between", alignItems: "center", paddingVertical: 56 },
    hint: { color: "#fff", backgroundColor: "rgba(0,0,0,0.55)", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, overflow: "hidden" },
    close: { backgroundColor: "rgba(0,0,0,0.65)", paddingVertical: 12, paddingHorizontal: 28, borderRadius: 999 },
    closeText: { color: "#fff", fontWeight: "600" },
  });
