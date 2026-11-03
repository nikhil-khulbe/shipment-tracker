import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Stores the admin's JWT.
 *
 * On iOS/Android this is expo-secure-store, backed by Keychain /
 * Keystore — encrypted at rest. SecureStore has no web implementation,
 * so the web build falls back to localStorage, which is readable by
 * any script on the page (XSS-exposed). That's a real limitation, not
 * an oversight — see README "Design decisions" for the tradeoff (an
 * httpOnly cookie would fix the web case but doesn't exist for a
 * native client sharing the same API).
 */
const TOKEN_KEY = "shipment-tracker-admin-token";

const isWeb = Platform.OS === "web";

export async function saveToken(token: string): Promise<void> {
  if (isWeb) {
    localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  if (isWeb) {
    return localStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  if (isWeb) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
