type StorageArea = "localStorage" | "sessionStorage";

const fallback: Record<StorageArea, Map<string, string>> = {
  localStorage: new Map(),
  sessionStorage: new Map(),
};
const nativeUnavailable: Record<StorageArea, boolean> = {
  localStorage: false,
  sessionStorage: false,
};

function nativeStorage(area: StorageArea): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[area];
  } catch {
    return null;
  }
}

function createSafeStorage(area: StorageArea) {
  return {
    getItem(key: string): string | null {
      try {
        const storage = nativeStorage(area);
        if (!storage) {
          nativeUnavailable[area] = true;
          return fallback[area].get(key) ?? null;
        }
        const value = storage.getItem(key);
        if (!nativeUnavailable[area]) return value;
      } catch {
        nativeUnavailable[area] = true;
      }
      return fallback[area].get(key) ?? null;
    },
    setItem(key: string, value: string): boolean {
      fallback[area].set(key, value);
      try {
        const storage = nativeStorage(area);
        if (!storage) {
          nativeUnavailable[area] = true;
          return false;
        }
        storage.setItem(key, value);
        nativeUnavailable[area] = false;
        return true;
      } catch {
        nativeUnavailable[area] = true;
        return false;
      }
    },
    removeItem(key: string): boolean {
      fallback[area].delete(key);
      try {
        const storage = nativeStorage(area);
        if (!storage) {
          nativeUnavailable[area] = true;
          return false;
        }
        storage.removeItem(key);
        if (!nativeUnavailable[area]) fallback[area].delete(key);
        return true;
      } catch {
        nativeUnavailable[area] = true;
        return false;
      }
    },
    isPersistent(): boolean {
      const probe = "__spikeycoins_storage_probe__";
      try {
        const storage = nativeStorage(area);
        if (!storage) return false;
        storage.setItem(probe, probe);
        storage.removeItem(probe);
        nativeUnavailable[area] = false;
        return true;
      } catch {
        nativeUnavailable[area] = true;
        return false;
      }
    },
  };
}

export const safeLocalStorage = createSafeStorage("localStorage");
export const safeSessionStorage = createSafeStorage("sessionStorage");
