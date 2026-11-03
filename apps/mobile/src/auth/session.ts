/**
 * Tiny pub/sub so the Apollo error link (which lives outside React) can
 * tell the UI "the session is gone" the moment a request is rejected,
 * instead of waiting for the Admin screen to remount and re-query.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitSessionExpired(): void {
  listeners.forEach((listener) => listener());
}
