import { StyleSheet } from "react-native";
import Animated, { SlideInUp, SlideOutUp } from "react-native-reanimated";
import { useNetInfo } from "@react-native-community/netinfo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/theme";
import { Text } from "./ui";

/**
 * Slides down from the top while the device has no connection.
 * `isConnected === false` is only set once NetInfo has actually checked, so
 * there's no flash of "offline" during startup (it starts as null).
 */
export function OfflineBanner() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { isConnected } = useNetInfo();
  if (isConnected !== false) return null;

  return (
    <Animated.View
      entering={SlideInUp}
      exiting={SlideOutUp}
      style={[styles.banner, { paddingTop: insets.top + 8, backgroundColor: t.status.OUT_FOR_DELIVERY }]}
      accessibilityRole="alert"
    >
      <Ionicons name="cloud-offline-outline" size={16} color="#1f2937" />
      <Text style={styles.text}>You're offline — showing saved data</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 8,
  },
  // Fixed dark text: the banner is always amber, in both themes.
  text: { color: "#1f2937", fontSize: 13, fontWeight: "600" },
});
