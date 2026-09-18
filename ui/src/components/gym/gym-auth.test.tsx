import { useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import api, { manualClearAuth, setTokens } from "@/lib/api";
import GymLayout from "@/app/(routes)/gym/layout";

function ProtectedChild({ onMount }: { onMount: () => void }) {
  useEffect(onMount, [onMount]);
  return <p>Protected Gym</p>;
}
function Status() {
  const auth = useAuth();
  return <p>{auth.isLoading ? "Loading auth" : auth.isLoggedIn ? "Signed in" : "Signed out"}</p>;
}

describe("Gym authentication boundary", () => {
  it("never mounts protected requests when only stale cached user details exist", async () => {
    localStorage.setItem("spikeyCoins_user", JSON.stringify({ _id: "stale-user" }));
    const mount = vi.fn();
    render(<AuthProvider><GymLayout><ProtectedChild onMount={mount} /></GymLayout></AuthProvider>);
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(mount).not.toHaveBeenCalled();
    expect(localStorage.getItem("spikeyCoins_user")).toBeNull();
  });

  it("unmounts protected content when the shared client invalidates the session", async () => {
    const user = { _id: "cached-user", name: "Test User" };
    const token = `header.${btoa(JSON.stringify({ exp: Date.now() / 1000 + 600 }))}.signature`;
    setTokens(token, "refresh");
    localStorage.setItem("spikeyCoins_user", JSON.stringify(user));
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: { success: true, user } });
    try {
      render(<AuthProvider><Status /><GymLayout><p>Protected Gym</p></GymLayout></AuthProvider>);
      await screen.findByText("Signed in");
      expect(screen.getByText("Protected Gym")).toBeVisible();
      act(() => manualClearAuth());
      expect(screen.getByText("Signed out")).toBeVisible();
      expect(screen.queryByText("Protected Gym")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Sign in" })).toBeVisible();
    } finally { get.mockRestore(); }
  });
});
