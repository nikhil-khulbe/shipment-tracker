import { StyleSheet } from "react-native";
import type { Theme } from "../../theme/theme";

/** Styles shared by the admin panels (form fields, buttons, chips, cards). */
export const makeAdminStyles = (t: Theme) =>
  StyleSheet.create({
    section: { marginBottom: 8 },
    sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
    hint: { fontSize: 13, color: t.textMuted, marginTop: 2 },
    label: { fontSize: 13, fontWeight: "600", color: t.textMuted, marginBottom: 6, marginTop: 14 },
    input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
    multiline: { minHeight: 140, textAlignVertical: "top" },
    primaryButton: {
      backgroundColor: t.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 18,
    },
    primaryButtonText: { color: t.onPrimary, fontWeight: "600", fontSize: 15 },
    secondaryButton: {
      borderWidth: 1,
      borderColor: t.text,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      alignItems: "center",
      alignSelf: "flex-start",
      marginTop: 12,
    },
    secondaryButtonText: { fontWeight: "600" },
    error: { color: t.danger, marginTop: 10 },
    success: { color: t.success, marginTop: 10 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: t.surfaceAlt,
      borderWidth: 1,
      borderColor: t.border,
    },
    chipOn: { backgroundColor: t.primary, borderColor: t.primary },
    chipText: { fontSize: 12, color: t.textFaint, fontWeight: "600" },
    chipTextOn: { color: t.onPrimary },
    card: { backgroundColor: t.surface, borderRadius: 12, padding: 14 },
    divider: { height: 1, backgroundColor: t.border, marginVertical: 24 },
  });
