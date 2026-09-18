import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, InternalAxiosRequestConfig } from "axios";
import { waitFor } from "@testing-library/react";
import api, { AUTH_CLEARED_EVENT, getApiPath, manualRefreshTokens, setTokens } from "./api";

const originalAdapter = api.defaults.adapter;
const unauthorized = (config: InternalAxiosRequestConfig) => new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, undefined, {
  status: 401, statusText: "Unauthorized", data: { error: "Invalid or expired token" }, headers: {}, config,
});
const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
  if (config.headers.Authorization !== "Bearer fresh-access") throw unauthorized(config);
  return { status: 200, statusText: "OK", data: { success: true }, headers: {}, config };
});
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  adapter.mockClear();
  api.defaults.adapter = adapter;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setTokens("expired-access", "valid-refresh");
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
});

function delayedRefresh() {
  let resolve!: (response: Response) => void;
  fetchMock.mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
  return resolve;
}
const freshResponse = () => new Response(JSON.stringify({ accessToken: "fresh-access", refreshToken: "rotated-refresh" }), { status: 200 });

describe("Shared authentication refresh", () => {
  it("retries a 401 that arrives during an AuthProvider-initiated refresh", async () => {
    const resolve = delayedRefresh();
    const manual = manualRefreshTokens();
    const request = api.get("/gym/session/active");
    await waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
    resolve(freshResponse());
    expect(await manual).toBe(true);
    expect((await request).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it("shares one refresh between simultaneous 401 responses", async () => {
    const resolve = delayedRefresh();
    const requests = Promise.all([api.get("/gym/stats"), api.get("/gym/chart/process-vs-pnl")]);
    await waitFor(() => expect(adapter).toHaveBeenCalledTimes(2));
    resolve(freshResponse());
    expect((await requests).every((response) => response.status === 200)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("settles all waiting requests and signals sign-out when refresh is rejected", async () => {
    const resolve = delayedRefresh();
    const listener = vi.fn();
    window.addEventListener(AUTH_CLEARED_EVENT, listener);
    try {
      const manual = manualRefreshTokens();
      const requests = Promise.allSettled([api.get("/gym/stats"), api.get("/gym/session/active")]);
      await waitFor(() => expect(adapter).toHaveBeenCalledTimes(2));
      resolve(new Response("{}", { status: 401 }));
      expect(await manual).toBe(false);
      expect((await requests).every((result) => result.status === "rejected")).toBe(true);
      expect(localStorage.getItem("spikeyCoins_accessToken")).toBeNull();
      expect(localStorage.getItem("spikeyCoins_refreshToken")).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally { window.removeEventListener(AUTH_CLEARED_EVENT, listener); }
  });

  it("retries a late old-token 401 without rotating credentials again", async () => {
    adapter.mockImplementationOnce(async (config) => {
      setTokens("fresh-access", "rotated-refresh");
      throw unauthorized(config);
    });
    expect((await api.get("/gym/session/active")).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it("keeps credentials on transient refresh failure", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(api.get("/gym/stats")).rejects.toMatchObject({ response: { status: 401 } });
    expect(localStorage.getItem("spikeyCoins_refreshToken")).toBe("valid-refresh");
  });

  it("does not refresh on incorrect login credentials", async () => {
    await expect(api.post("/auth/login", {})).rejects.toMatchObject({ response: { status: 401 } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("spikeyCoins_refreshToken")).toBe("valid-refresh");
  });

  it("clears stale signed-in state if no refresh credential remains", async () => {
    localStorage.removeItem("spikeyCoins_refreshToken");
    localStorage.setItem("spikeyCoins_user", JSON.stringify({ name: "Expired user" }));
    await expect(api.get("/gym/stats")).rejects.toMatchObject({ response: { status: 401 } });
    expect(localStorage.getItem("spikeyCoins_user")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("URL prefix normalization", () => {
  it("normalizes /api/ prefix in request interceptor to prevent duplicate /api/api/... paths", async () => {
    setTokens("fresh-access", "valid-refresh");
    await api.get("/api/accounts");
    expect(adapter).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/accounts",
      })
    );
  });

  it("getApiPath strips /api/ prefix and handles /api correctly", () => {
    expect(getApiPath("/api/accounts")).toBe("/accounts");
    expect(getApiPath("/api/gym/session/123")).toBe("/gym/session/123");
    expect(getApiPath("/api")).toBe("");
    expect(getApiPath("/accounts")).toBe("/accounts");
  });
});

