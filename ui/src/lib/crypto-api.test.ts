import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { cryptoApi } from "./crypto-api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

describe("crypto research jobs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts one job through the shared client and polls until completed", async () => {
    const summary = { symbol: "BTC", analysis: "Completed analysis" };
    vi.mocked(api.post).mockResolvedValue({ data: { jobId: "job-1" } });
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { status: "pending" } })
      .mockResolvedValueOnce({ data: { status: "completed", summary } });

    const result = cryptoApi.researchCoin("BTC");
    await vi.advanceTimersByTimeAsync(4000);

    expect((await result).data).toEqual({ status: "completed", success: true, summary });
    expect(api.post).toHaveBeenCalledExactlyOnceWith("/admin/research/BTC");
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenNthCalledWith(1, "/admin/research/jobs/job-1");
    expect(api.get).toHaveBeenNthCalledWith(2, "/admin/research/jobs/job-1");
  });

  it("surfaces a failed job and stops polling", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { jobId: "job-2" } });
    vi.mocked(api.get).mockResolvedValue({
      data: { status: "failed", error: "Research provider unavailable" },
    });

    const assertion = expect(cryptoApi.researchCoin("ETH")).rejects.toThrow(
      "Research provider unavailable",
    );
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("bounds polling when the job remains pending", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { jobId: "job-3" } });
    vi.mocked(api.get).mockResolvedValue({ data: { status: "pending" } });

    const assertion = expect(cryptoApi.researchCoin("SOL")).rejects.toThrow(
      "Research analysis timed out after 90 seconds",
    );
    await vi.advanceTimersByTimeAsync(100000);
    await assertion;
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledTimes(45);
    expect(vi.getTimerCount()).toBe(0);
  });
});
