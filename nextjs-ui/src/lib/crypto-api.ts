"use client";

import axios from "axios";
import { API_CONFIG } from "@/lib/constants";

const cryptoClient = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const cryptoApi = {
  async getTickers() {
    const response = await cryptoClient.get("/api/ticker/24hr");
    return response;
  },

  async get24hrTicker() {
    const response = await cryptoClient.get("/api/ticker/24hr");
    return response;
  },

  async refreshMarketcapData() {
    const response = await cryptoClient.get("/api/ticker/refreshMarketcapData");
    return response;
  },

  async getMarketOverview() {
    const response = await cryptoClient.get("/api/market/overview");
    return response;
  },

  async getSummaries() {
    const response = await cryptoClient.get("/api/summaries");
    return response;
  },

  async get7dTopMovers() {
    const response = await cryptoClient.get("/api/ticker/7d");
    return response;
  },
};
