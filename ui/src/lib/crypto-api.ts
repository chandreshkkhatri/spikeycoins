"use client";

import api from "@/lib/api";

export const cryptoApi = {
  async getTickers() {
    return api.get("/ticker/24hr");
  },

  async get24hrTicker() {
    return api.get("/ticker/24hr");
  },

  async refreshMarketcapData() {
    return api.get("/ticker/refreshMarketcapData");
  },

  async getMarketOverview() {
    return api.get("/market/overview");
  },

  async getSummaries() {
    return api.get("/summaries");
  },

  async get7dTopMovers(limit = 5) {
    return api.get("/ticker/7d", { params: { limit } });
  },

  async researchCoin(symbol: string, _authToken?: string) {
    // Initiate research job using shared API client with automatic token refresh
    const initResponse = await api.post(`/admin/research/${symbol}`);

    if (initResponse.data?.summary) {
      return initResponse;
    }

    const jobId = initResponse.data?.jobId;
    if (!jobId) {
      return initResponse;
    }

    // Poll for status every 2 seconds up to 90 seconds
    const maxAttempts = 45;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const statusResponse = await api.get(`/admin/research/jobs/${jobId}`);
      const { status, summary, error } = statusResponse.data || {};

      if (status === "completed") {
        return {
          ...statusResponse,
          data: {
            ...statusResponse.data,
            success: true,
            summary,
          },
        };
      }

      if (status === "failed") {
        throw new Error(error || "Research analysis failed");
      }
    }

    throw new Error("Research analysis timed out after 90 seconds");
  },
};
