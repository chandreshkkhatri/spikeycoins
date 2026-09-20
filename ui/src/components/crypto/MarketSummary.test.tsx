import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MarketSummary from "./MarketSummary";
import { cryptoApi } from "@/lib/crypto-api";

vi.mock("@/lib/crypto-api", () => ({
  cryptoApi: {
    getSummaries: vi.fn(),
  },
}));

const stories = Array.from({ length: 4 }, (_, index) => ({
  id: `story-${index + 1}`,
  title: `Story ${index + 1}`,
  summary: `Summary ${index + 1}`,
  source: "Example source",
  impact: "medium",
  category: "Market",
}));

describe("MarketSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps loaded research visible when a refresh fails", async () => {
    vi.mocked(cryptoApi.getSummaries)
      .mockResolvedValueOnce({ data: stories } as never)
      .mockRejectedValueOnce(new Error("Provider unavailable"));

    render(<MarketSummary />);

    expect(await screen.findByText("Story 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show all 4 stories" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.getByText(/Update failed. Showing the last loaded research/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Story 1")).toBeInTheDocument();
  });
});
