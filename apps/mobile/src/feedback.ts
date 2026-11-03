import * as Haptics from "expo-haptics";
import Toast from "react-native-toast-message";

/**
 * One place for "something happened" feedback so screens stay readable.
 * Haptics are best-effort: they no-op on web and on devices without a
 * haptic engine, and a failure must never break the action itself.
 */
function haptic(run: () => Promise<void>) {
  run().catch(() => {});
}

export const feedback = {
  tracked() {
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  success(message: string) {
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    Toast.show({ type: "success", text1: message });
  },
  error(message: string) {
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
    Toast.show({ type: "error", text1: message });
  },
  info(message: string) {
    Toast.show({ type: "info", text1: message });
  },
};
