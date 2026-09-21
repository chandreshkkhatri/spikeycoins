import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";
import { safeLocalStorage, safeSessionStorage } from "@/lib/browser-storage";

const mocks = vi.hoisted(() => ({ google: vi.fn(), push: vi.fn() }));
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({
  login: vi.fn(), register: vi.fn(), loginWithGoogle: mocks.google,
  isLoggedIn: false, isLoading: false, error: null,
}) }));
vi.mock("@/contexts/theme-context", () => ({ useTheme: () => ({ isDark: false }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams("returnTo=%2Fmarket-watch"),
}));

afterEach(() => {
  vi.restoreAllMocks();
  safeLocalStorage.isPersistent();
  safeSessionStorage.isPersistent();
  mocks.google.mockReset();
  mocks.push.mockReset();
});

describe("mobile login storage fallback", () => {
  it("warns without crashing and still starts Google sign-in when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    render(<LoginPage />);
    expect(await screen.findByRole("status")).toHaveTextContent("Browser storage is unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(mocks.google).toHaveBeenCalledTimes(1);
  });
});
