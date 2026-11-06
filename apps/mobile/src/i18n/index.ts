import { useCallback, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { en, type MessageKey } from "./en";
import { hi } from "./hi";

export type Lang = "en" | "hi";
export type { MessageKey };

const KEY = "shipment-tracker-lang-v1";
const catalogs: Record<Lang, Record<MessageKey, string>> = { en, hi };

function detectLang(): Lang {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("hi") ? "hi" : "en";
  } catch {
    return "en";
  }
}

// A tiny external store, so non-React code (ETA text, status labels) and
// React components read the same language, and components re-render on change.
let current: Lang = detectLang();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  listeners.forEach((listener) => listener());
  AsyncStorage.setItem(KEY, lang).catch(() => {});
}

/** Restores the language the user last picked. Call once at startup, before the first render. */
export async function loadLang(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved === "en" || saved === "hi") current = saved;
  } catch {
    // keep the detected default
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type Params = Record<string, string | number>;

/** Looks up a message and fills `{name}` placeholders. Falls back to English, then to the key itself. */
export function translate(key: MessageKey, params?: Params, lang: Lang = current): string {
  const template = catalogs[lang][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** Locale for dates and times; undefined lets the device decide for English. */
export function dateLocale(lang: Lang = current): string | undefined {
  return lang === "hi" ? "hi-IN" : undefined;
}

/** The current language, re-rendering the component when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** `t("track.title")` bound to the current language. */
export function useT() {
  const lang = useLang();
  return useCallback((key: MessageKey, params?: Params) => translate(key, params, lang), [lang]);
}
