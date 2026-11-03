import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme/theme";

/** Track + fill. `progress` is 0..1; the fill animates whenever it changes (including from 0 on mount). */
export function ProgressBar({ progress, color }: { progress: number; color: string }) {
  const t = useTheme();
  const value = useSharedValue(0);

  useEffect(() => {
    value.value = withTiming(progress, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [progress, value]);

  const fill = useAnimatedStyle(() => ({ width: `${value.value * 100}%` }));

  return (
    <View style={[styles.track, { backgroundColor: t.surfaceAlt }]}>
      <Animated.View style={[styles.fill, { backgroundColor: color }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
});
