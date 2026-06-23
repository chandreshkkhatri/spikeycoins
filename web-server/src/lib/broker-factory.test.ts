import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrokerFactory } from "./broker-factory";
import { IAccount } from "../models/account";

// Define mock functions at module scope so they are stable
const mockUpstoxInitialize = vi.fn();
const mockUpstoxSetAccessToken = vi.fn();

vi.mock("./upstox-service", () => {
  return {
    UpstoxService: class {
      initializeWithCredentials = mockUpstoxInitialize;
      setAccessToken = mockUpstoxSetAccessToken;
    },
  };
});

const mockBinanceInitialize = vi.fn();

vi.mock("./binance-service", () => {
  return {
    BinanceService: class {
      initializeWithCredentials = mockBinanceInitialize;
    },
  };
});

describe("BrokerFactory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getUpstoxClient", () => {
    it("should throw an error if accountType is not upstox", () => {
      const mockAccount = {
        accountType: "binance",
      } as IAccount;

      expect(() => BrokerFactory.getUpstoxClient(mockAccount)).toThrow(
        "Invalid account type for Upstox client"
      );
    });

    it("should initialize UpstoxService with credentials and token", () => {
      const mockAccount = {
        accountType: "upstox",
        apiKey: "api-key-123",
        apiSecret: "api-secret-123",
        accessToken: "access-token-123",
        metadata: {
          sandbox: true,
        },
      } as IAccount;

      const client = BrokerFactory.getUpstoxClient(mockAccount);
      expect(client).toBeDefined();
      expect(mockUpstoxInitialize).toHaveBeenCalledWith(
        "api-key-123",
        "api-secret-123",
        true
      );
      expect(mockUpstoxSetAccessToken).toHaveBeenCalledWith("access-token-123");
    });

    it("should not call setAccessToken if accessToken is not provided", () => {
      const mockAccount = {
        accountType: "upstox",
        apiKey: "api-key-123",
        apiSecret: "api-secret-123",
        metadata: {},
      } as IAccount;

      const client = BrokerFactory.getUpstoxClient(mockAccount);
      expect(client).toBeDefined();
      expect(mockUpstoxInitialize).toHaveBeenCalledWith(
        "api-key-123",
        "api-secret-123",
        false // defaults to false
      );
      expect(mockUpstoxSetAccessToken).not.toHaveBeenCalled();
    });
  });

  describe("getBinanceClient", () => {
    it("should throw an error if accountType is not binance", () => {
      const mockAccount = {
        accountType: "upstox",
      } as IAccount;

      expect(() => BrokerFactory.getBinanceClient(mockAccount)).toThrow(
        "Invalid account type for Binance client"
      );
    });

    it("should initialize BinanceService with credentials", () => {
      const mockAccount = {
        accountType: "binance",
        apiKey: "api-key-456",
        apiSecret: "api-secret-456",
        metadata: {
          testnet: true,
        },
      } as IAccount;

      const client = BrokerFactory.getBinanceClient(mockAccount);
      expect(client).toBeDefined();
      expect(mockBinanceInitialize).toHaveBeenCalledWith(
        "api-key-456",
        "api-secret-456",
        true
      );
    });
  });
});
