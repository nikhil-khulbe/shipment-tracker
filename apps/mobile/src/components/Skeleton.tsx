import { useEffect } from "react";
import { StyleSheet, View, type DimensionValue, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../theme/theme";

/** A grey block that pulses. Compose these into shapes that mirror real content. */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = 8,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: t.skeleton }, animated, style]}
    />
  );
}

/** Shaped like ShipmentHeaderCard + three timeline rows, so layout doesn't jump on load. */
export function ShipmentSkeleton() {
  const t = useTheme();
  return (
    <View accessibilityLabel="Loading shipment">
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <View style={styles.row}>
          <Skeleton width={140} height={20} />
          <Skeleton width={90} height={24} radius={999} />
        </View>
        <Skeleton width="60%" height={16} />
        <Skeleton width="40%" height={12} />
        <Skeleton height={8} radius={4} style={{ marginTop: 6 }} />
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.event}>
          <Skeleton width={10} height={10} radius={5} style={{ marginTop: 4 }} />
          <View style={styles.eventBody}>
            <Skeleton width={110} height={24} radius={999} />
            <Skeleton width="55%" height={14} />
            <Skeleton width={80} height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, marginBottom: 24, gap: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  event: { flexDirection: "row", gap: 14, marginBottom: 22, paddingLeft: 7 },
  eventBody: { flex: 1, gap: 8 },
});
