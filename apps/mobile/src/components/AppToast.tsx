import { StyleSheet, View } from "react-native";
import Toast, { type ToastConfig } from "react-native-toast-message";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/theme";
import { Text } from "./ui";

type Kind = "success" | "error" | "info";
const ICONS: Record<Kind, "checkmark-circle" | "alert-circle" | "information-circle"> = {
  success: "checkmark-circle",
  error: "alert-circle",
  info: "information-circle",
};

function ToastCard({ kind, text }: { kind: Kind; text?: string }) {
  const t = useTheme();
  const accent = kind === "success" ? t.status.DELIVERED : kind === "error" ? t.danger : t.status.PICKED_UP;
  return (
    <View style={[styles.card, { backgroundColor: t.surfaceAlt, borderColor: accent }]}>
      <Ionicons name={ICONS[kind]} size={22} color={accent} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const config: ToastConfig = {
  success: ({ text1 }) => <ToastCard kind="success" text={text1} />,
  error: ({ text1 }) => <ToastCard kind="error" text={text1} />,
  info: ({ text1 }) => <ToastCard kind="info" text={text1} />,
};

/** Mount once, at the root, after the navigator so toasts draw on top. */
export function AppToast() {
  const insets = useSafeAreaInsets();
  return <Toast config={config} topOffset={insets.top + 8} />;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "stretch",
  },
  text: { flex: 1, fontSize: 14, fontWeight: "600" },
});
