import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "shipment-tracker-recent-searches-v1";
const MAX_RECENT = 5;

/** Last few tracking IDs that actually returned a shipment, newest first. */
export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecent(parsed.filter((v): v is string => typeof v === "string"));
      })
      .catch(() => {});
  }, []);

  const add = useCallback((trackingId: string) => {
    setRecent((current) => {
      const next = [trackingId, ...current.filter((id) => id !== trackingId)].slice(0, MAX_RECENT);
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { recent, add };
}
