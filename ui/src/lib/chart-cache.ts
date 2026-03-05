/**
 * IndexedDB-based cache for chart candle data.
 *
 * Replaces the previous localStorage approach which was limited to ~5 MB
 * and caused silent failures on mobile devices.  IndexedDB typically allows
 * hundreds of MB and handles large binary/JSON payloads efficiently.
 *
 * The API mirrors the old `localCache` object so the migration in
 * MultiTimeframeChart is a drop-in replacement.
 */

const DB_NAME = "spikeycoins_charts";
const DB_VERSION = 1;
const STORE_NAME = "candles";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null; // allow retry
      reject(request.error);
    };
  });

  return dbPromise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve cached candle data.  Returns `null` when the key is missing or
 * expired (older than 24 h).
 */
async function get<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        const entry = req.result as CacheEntry<T> | undefined;
        if (!entry) {
          resolve(null);
          return;
        }
        // Expiry check
        if (Date.now() - entry.timestamp > MAX_AGE_MS) {
          // Fire-and-forget delete
          deleteKey(key).catch(() => {});
          resolve(null);
          return;
        }
        resolve(entry.data);
      };

      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Store candle data.  Silently fails if IndexedDB is unavailable.
 */
const MAX_ENTRIES = 50;

async function set<T>(key: string, data: T): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const entry: CacheEntry<T> = { key, data, timestamp: Date.now() };
      const req = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // swallow
    });

    // Auto-prune: check entry count and trim oldest if over limit
    const count = await new Promise<number>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
    if (count > MAX_ENTRIES) {
      prune(count - MAX_ENTRIES);
    }
  } catch {
    // IndexedDB unavailable — silently skip
  }
}

/**
 * Delete a single key.
 */
async function deleteKey(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

/**
 * Remove the oldest `count` entries by timestamp.
 */
async function prune(count: number): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("timestamp");
      const req = index.openCursor(); // ascending = oldest first
      let deleted = 0;

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && deleted < count) {
          cursor.delete();
          deleted++;
          cursor.continue();
        } else {
          resolve();
        }
      };

      req.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

/**
 * Remove ALL cached candle data from IndexedDB.
 */
async function clearAll(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

/**
 * One-time migration: move any `chartCache_*` entries from localStorage
 * into IndexedDB so users don't lose their cache on upgrade and localStorage
 * is freed up.
 */
async function migrateFromLocalStorage(): Promise<void> {
  try {
    if (typeof window === "undefined") return;

    const PREFIX = "chartCache_";
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        keysToRemove.push(k);
      }
    }

    if (keysToRemove.length === 0) return;

    for (const fullKey of keysToRemove) {
      try {
        const raw = localStorage.getItem(fullKey);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.data && parsed.timestamp) {
          // Only migrate if not expired
          if (Date.now() - parsed.timestamp < MAX_AGE_MS) {
            const cacheKey = fullKey.slice(PREFIX.length);
            await set(cacheKey, parsed.data);
          }
        }
      } catch {
        // Skip corrupted entries
      }
      localStorage.removeItem(fullKey);
    }
  } catch {
    // Migration is best-effort
  }
}

const chartCache = {
  get,
  set,
  prune,
  clearAll,
  deleteKey,
  migrateFromLocalStorage,
};

export default chartCache;
