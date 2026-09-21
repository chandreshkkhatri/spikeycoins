import { afterEach, describe, expect, it, vi } from "vitest";
import { safeLocalStorage, safeSessionStorage } from "./browser-storage";

const keys = ["blocked-local", "blocked-session"];

afterEach(() => {
  vi.restoreAllMocks();
  safeLocalStorage.isPersistent();
  safeSessionStorage.isPersistent();
  for (const key of keys) {
    safeLocalStorage.removeItem(key);
    safeSessionStorage.removeItem(key);
  }
});

describe("safe browser storage", () => {
  it("falls back to current-page memory when native storage operations throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });

    expect(safeLocalStorage.setItem("blocked-local", "access-token")).toBe(false);
    expect(safeSessionStorage.setItem("blocked-session", "/market-watch")).toBe(false);
    expect(safeLocalStorage.getItem("blocked-local")).toBe("access-token");
    expect(safeSessionStorage.getItem("blocked-session")).toBe("/market-watch");
    expect(safeLocalStorage.isPersistent()).toBe(false);
    expect(safeLocalStorage.removeItem("blocked-local")).toBe(false);
    expect(safeLocalStorage.getItem("blocked-local")).toBeNull();
  });
});
