import { useColorScheme } from "react-native";
import type { ShipmentStatus } from "../types";

/**
 * Every colour in the app lives here. Components never contain hex
 * literals — they call useTheme() — so dark mode is one switch, not a
 * hunt through every StyleSheet.
 */
export type Theme = {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string; // button background
  onPrimary: string;
  danger: string;
  success: string;
  successBg: string;
  skeleton: string;
  status: Record<ShipmentStatus, string>;
};

const lightStatus: Record<ShipmentStatus, string> = {
  CREATED: "#6b7280",
  PICKED_UP: "#2563eb",
  IN_TRANSIT: "#7c3aed",
  OUT_FOR_DELIVERY: "#d97706",
  DELIVERED: "#16a34a",
  DELAYED: "#b45309",
  ON_HOLD: "#64748b",
  DELIVERY_ATTEMPT_FAILED: "#dc2626",
  RETURNED: "#be185d",
  CANCELLED: "#6b7280",
};

// Brighter tints so badges keep contrast on dark surfaces.
const darkStatus: Record<ShipmentStatus, string> = {
  CREATED: "#9ca3af",
  PICKED_UP: "#60a5fa",
  IN_TRANSIT: "#a78bfa",
  OUT_FOR_DELIVERY: "#fbbf24",
  DELIVERED: "#4ade80",
  DELAYED: "#f59e0b",
  ON_HOLD: "#94a3b8",
  DELIVERY_ATTEMPT_FAILED: "#f87171",
  RETURNED: "#f472b6",
  CANCELLED: "#9ca3af",
};

export const lightTheme: Theme = {
  dark: false,
  bg: "#ffffff",
  surface: "#f9fafb",
  surfaceAlt: "#f3f4f6",
  border: "#d1d5db",
  text: "#111827",
  textMuted: "#6b7280",
  textFaint: "#9ca3af",
  primary: "#111827",
  onPrimary: "#ffffff",
  danger: "#dc2626",
  success: "#166534",
  successBg: "#ecfdf5",
  skeleton: "#e5e7eb",
  status: lightStatus,
};

export const darkTheme: Theme = {
  dark: true,
  bg: "#0b0f17",
  surface: "#151b27",
  surfaceAlt: "#1e2636",
  border: "#2d3748",
  text: "#f3f4f6",
  textMuted: "#9ca3af",
  textFaint: "#6b7280",
  primary: "#f3f4f6",
  onPrimary: "#0b0f17",
  danger: "#f87171",
  success: "#86efac",
  successBg: "#0f2a1c",
  skeleton: "#252e3f",
  status: darkStatus,
};

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? darkTheme : lightTheme;
}
