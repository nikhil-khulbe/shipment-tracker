import AsyncStorage from "@react-native-async-storage/async-storage";
import { InMemoryCache, type TypePolicies } from "@apollo/client";

/**
 * Offline support: save the Apollo cache to AsyncStorage and load it again
 * on launch, so the last-tracked shipment still renders with no network.
 *
 * Why not apollo3-cache-persist: it targets Apollo Client 3 (peer range
 * ^3.7, unmaintained since 2024) and this app is on v4. More importantly it
 * can't filter what it saves, and we must not persist admin data — see
 * `snapshot()`.
 *
 * `registerCache` is called once from apollo.ts (this module can't import the
 * cache itself without creating an import cycle).
 */
const STORAGE_KEY = "shipment-tracker-apollo-cache-v1";
const SAVE_DEBOUNCE_MS = 1000;

let registered: { cache: InMemoryCache; typePolicies: TypePolicies } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function registerCache(cache: InMemoryCache, typePolicies: TypePolicies): void {
  registered = { cache, typePolicies };
}

/**
 * Copy of the cache with everything admin-only removed. Persisting the live
 * cache directly would write the admin's shipment list and profile to disk
 * in plain text — for a public tracking app that should only remember what
 * the public Track screen showed.
 *
 * We restore into a throwaway cache, evict the admin fields, then gc():
 * eviction alone leaves the list's Shipment objects behind as unreachable
 * orphans; gc() sweeps everything no longer reachable from the root.
 */
function snapshot(): string {
  const { cache, typePolicies } = registered!;
  const scratch = new InMemoryCache({ typePolicies });
  scratch.restore(cache.extract());
  scratch.evict({ fieldName: "shipments" });
  scratch.evict({ fieldName: "me" });
  scratch.evict({ fieldName: "authRequired" }); // never trust a stale "no login needed" from disk
  scratch.gc();
  return JSON.stringify(scratch.extract());
}

async function save(): Promise<void> {
  if (!registered) return;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, snapshot());
  } catch {
    // Persistence is best-effort (storage full, private mode…): never break the app over it.
  }
}

/** Debounced: a burst of responses (e.g. polling + a mutation) becomes one write. */
export function schedulePersist(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void save();
  }, SAVE_DEBOUNCE_MS);
}

/** Call once at startup, before rendering anything that reads the cache. */
export async function restoreCache(): Promise<void> {
  if (!registered) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) registered.cache.restore(JSON.parse(raw));
  } catch {
    // A corrupt or incompatible snapshot is not worth crashing for: start empty.
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }
}

/** Wipe the on-disk copy (used on logout). */
export async function clearPersistedCache(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}
