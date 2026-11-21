import "server-only";

/**
 * Tiny in-process TTL cache for hot per-request lookups (session checks, company access,
 * permissions). Every API request runs these before its real work, and each one is a full
 * round trip to the database — caching them removes that latency from almost every call.
 *
 * Stored on globalThis so every route bundle (and dev hot reloads) share one instance;
 * otherwise an invalidate() in one route handler would not clear another route's copy.
 * Single-server deployment (EC2 + Docker), so in-process invalidation is authoritative;
 * the TTL is only a backstop.
 */
export interface TtlCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  delete(key: string): void;
  clear(): void;
}

const registry = globalThis as unknown as { __maTtlCaches?: Map<string, Map<string, { at: number; value: unknown }>> };

export function ttlCache<V>(name: string, ttlMs: number): TtlCache<V> {
  registry.__maTtlCaches ??= new Map();
  let store = registry.__maTtlCaches.get(name);
  if (!store) {
    store = new Map();
    registry.__maTtlCaches.set(name, store);
  }
  const map = store;
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at >= ttlMs) {
        map.delete(key);
        return undefined;
      }
      return hit.value as V;
    },
    set(key, value) {
      map.set(key, { at: Date.now(), value });
    },
    delete(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}
