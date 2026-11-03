import { Platform } from "react-native";
import * as Linking from "expo-linking";
import type { LinkingOptions } from "@react-navigation/native";

/**
 * Deep links.
 *  - Native: shipmenttracker://track/SHP-XXXX  (scheme registered in app.json)
 *  - Web:    https://<site>/track/SHP-XXXX     (real URL path; the host must
 *            rewrite every path to index.html — see apps/mobile/public/_redirects)
 *
 * `trackingId` is optional so plain `/track` still opens the empty search.
 */
export const linking: LinkingOptions<ReactNavigation.RootParamList> = {
  prefixes: [Linking.createURL("/"), "shipmenttracker://"],
  config: {
    screens: {
      Track: "track/:trackingId?",
      Admin: "admin",
    },
  },
};

/**
 * The URL we hand to the Share sheet. A recipient without the app can only
 * open an https link, so prefer EXPO_PUBLIC_WEB_URL (the deployed web build);
 * on web itself use the current origin; otherwise fall back to the app scheme.
 */
export function buildShareUrl(trackingId: string): string {
  const path = `/track/${encodeURIComponent(trackingId)}`;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, "");
  return webUrl ? `${webUrl}${path}` : Linking.createURL(path);
}
