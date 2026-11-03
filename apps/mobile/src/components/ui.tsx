import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";
import { font } from "../theme/fonts";
import { useTheme } from "../theme/theme";

/**
 * Custom fonts on native ignore `fontWeight` — each weight is its own
 * font family. These wrappers translate the `fontWeight` already used in
 * our StyleSheets into the right Inter file, so screens keep writing
 * ordinary styles and still get the brand font. They also supply the
 * theme's default text colour.
 */
function familyFor(weight: TextStyle["fontWeight"]): string {
  switch (weight) {
    case "700":
    case "800":
    case "900":
    case "bold":
      return font.bold;
    case "600":
      return font.semibold;
    case "500":
      return font.medium;
    default:
      return font.regular;
  }
}

function withFont(style: TextProps["style"]) {
  const flat = StyleSheet.flatten(style) ?? {};
  // fontWeight must be dropped: on Android it would make RN synthesize
  // bold on top of an already-bold font file.
  const { fontWeight, ...rest } = flat as TextStyle;
  return { ...rest, fontFamily: familyFor(fontWeight) };
}

export function Text({ style, ...props }: TextProps) {
  const t = useTheme();
  return <RNText {...props} style={[{ color: t.text }, withFont(style)]} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  const t = useTheme();
  return (
    <RNTextInput
      placeholderTextColor={t.textFaint}
      {...props}
      style={[{ color: t.text, borderColor: t.border, backgroundColor: t.bg }, withFont(style)]}
    />
  );
}
