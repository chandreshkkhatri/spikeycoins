import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Providers } from "./providers";
import api from "@/lib/api";
import { safeLocalStorage, safeSessionStorage } from "@/lib/browser-storage";

afterEach(() => vi.restoreAllMocks());

describe("application providers", () => {
  it("mounts when browser storage access is denied", async () => {
    const localDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    const sessionDescriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "localStorage", { configurable: true, get() {
      throw new DOMException("Storage access is denied", "SecurityError");
    } });
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() {
      throw new DOMException("Storage access is denied", "SecurityError");
    } });
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: { success: true, accounts: [] } });
    try {
      render(<Providers><p>Application loaded</p></Providers>);
      expect(screen.getByText("Application loaded")).toBeVisible();
      await waitFor(() => expect(get).toHaveBeenCalled());
    } finally {
      if (localDescriptor) Object.defineProperty(window, "localStorage", localDescriptor);
      if (sessionDescriptor) Object.defineProperty(window, "sessionStorage", sessionDescriptor);
      safeLocalStorage.isPersistent();
      safeSessionStorage.isPersistent();
    }
  });
});
