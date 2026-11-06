import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "shipment-tracker-saved-v1";
export const MAX_SAVED = 30;

/** Adds the ID (newest first) or removes it if already present. Pure, so it can be unit tested. */
export function toggleSaved(list: string[], trackingId: string, max: number = MAX_SAVED): string[] {
  if (list.includes(trackingId)) return list.filter((id) => id !== trackingId);
  return [trackingId, ...list].slice(0, max);
}

/**
 * Tracking IDs the user chose to keep ("My shipments"). Stored on the device
 * only; there are no user accounts, so nothing about this reaches the server.
 */
export function useSavedShipments() {
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setSaved(parsed.filter((v): v is string => typeof v === "string"));
      })
      .catch(() => {});
  }, []);

  const toggle = useCallback((trackingId: string) => {
    setSaved((current) => {
      const next = toggleSaved(current, trackingId);
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const isSaved = useCallback((trackingId: string) => saved.includes(trackingId), [saved]);

  return { saved, isSaved, toggle };
}
