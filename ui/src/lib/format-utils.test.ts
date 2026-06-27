import { describe, it, expect } from "vitest";
import {
  calculatePriceDecimals,
  formatPrice,
  formatVolume,
  formatPercent,
  formatQuantity,
  getVendorColor,
  formatBrokerAmount,
} from "./format-utils";

describe("format-utils", () => {
  describe("calculatePriceDecimals", () => {
    it("should return 2 for price 0", () => {
      expect(calculatePriceDecimals(0)).toBe(2);
    });

    it("should handle boundary values at each magnitude threshold", () => {
      // price < 0.00001 -> 10
      expect(calculatePriceDecimals(0.000009)).toBe(10);
      expect(calculatePriceDecimals(-0.000009)).toBe(10);

      // 0.00001 <= price < 0.0001 -> 8
      expect(calculatePriceDecimals(0.00001)).toBe(8);
      expect(calculatePriceDecimals(0.000099)).toBe(8);

      // 0.0001 <= price < 0.001 -> 6
      expect(calculatePriceDecimals(0.0001)).toBe(6);
      expect(calculatePriceDecimals(0.00099)).toBe(6);

      // 0.001 <= price < 0.01 -> 5
      expect(calculatePriceDecimals(0.001)).toBe(5);
      expect(calculatePriceDecimals(0.0099)).toBe(5);

      // 0.01 <= price < 0.1 -> 4
      expect(calculatePriceDecimals(0.01)).toBe(4);
      expect(calculatePriceDecimals(0.099)).toBe(4);

      // 0.1 <= price < 1 -> 4
      expect(calculatePriceDecimals(0.1)).toBe(4);
      expect(calculatePriceDecimals(0.99)).toBe(4);

      // 1 <= price < 10 -> 3
      expect(calculatePriceDecimals(1)).toBe(3);
      expect(calculatePriceDecimals(9.99)).toBe(3);

      // 10 <= price < 100 -> 2
      expect(calculatePriceDecimals(10)).toBe(2);
      expect(calculatePriceDecimals(99.99)).toBe(2);

      // 100 <= price < 1000 -> 2
      expect(calculatePriceDecimals(100)).toBe(2);
      expect(calculatePriceDecimals(999.99)).toBe(2);

      // price >= 1000 -> 0
      expect(calculatePriceDecimals(1000)).toBe(0);
      expect(calculatePriceDecimals(5000)).toBe(0);
    });
  });

  describe("formatPrice", () => {
    it("should handle null, undefined, and NaN values", () => {
      expect(formatPrice(null)).toBe("0.00");
      expect(formatPrice(undefined)).toBe("0.00");
      expect(formatPrice(NaN)).toBe("0.00");
      expect(formatPrice(null, "$")).toBe("$0.00");
    });

    it("should handle 0", () => {
      expect(formatPrice(0)).toBe("0.00");
      expect(formatPrice(0, "$")).toBe("$0.00");
    });

    it("should insert commas for prices >= 1000", () => {
      expect(formatPrice(1000)).toBe("1,000");
      expect(formatPrice(1234567.89)).toBe("1,234,568"); // decimals = 0 for >= 1000
    });

    it("should handle symbol prefixes", () => {
      expect(formatPrice(50, "$")).toBe("$50.00");
      expect(formatPrice(1500, "₹")).toBe("₹1,500");
    });

    it("should format small numbers with appropriate decimals", () => {
      expect(formatPrice(0.05)).toBe("0.0500");
      expect(formatPrice(0.0005)).toBe("0.000500");
    });
  });

  describe("formatVolume", () => {
    it("should handle null, undefined, and NaN values", () => {
      expect(formatVolume(null)).toBe("0");
      expect(formatVolume(undefined)).toBe("0");
      expect(formatVolume(NaN)).toBe("0");
    });

    it("should handle zero", () => {
      expect(formatVolume(0)).toBe("0");
    });

    it("should format with K, M, B suffixes based on thresholds", () => {
      expect(formatVolume(123)).toBe("123.00");
      expect(formatVolume(999.9)).toBe("999.90");
      
      expect(formatVolume(1000)).toBe("1.00K");
      expect(formatVolume(850400)).toBe("850.40K");
      
      expect(formatVolume(1000000)).toBe("1.00M");
      expect(formatVolume(78912345)).toBe("78.91M");
      
      expect(formatVolume(1000000000)).toBe("1.00B");
      expect(formatVolume(45678912345)).toBe("45.68B");
    });

    it("should support negative volume values with appropriate suffix", () => {
      expect(formatVolume(-1500)).toBe("-1.50K");
      expect(formatVolume(-5000000)).toBe("-5.00M");
    });
  });

  describe("formatPercent", () => {
    it("should handle null, undefined, and NaN values", () => {
      expect(formatPercent(null)).toBe("0.00%");
      expect(formatPercent(undefined)).toBe("0.00%");
      expect(formatPercent(NaN)).toBe("0.00%");
    });

    it("should prepend '+' for positive percent by default", () => {
      expect(formatPercent(5.23)).toBe("+5.23%");
      expect(formatPercent(0.05)).toBe("+0.05%");
    });

    it("should not prepend '+' for positive percent if includeSign is false", () => {
      expect(formatPercent(5.23, false)).toBe("5.23%");
    });

    it("should format negative and zero percents correctly", () => {
      expect(formatPercent(-3.14)).toBe("-3.14%");
      expect(formatPercent(-3.14, false)).toBe("-3.14%");
      expect(formatPercent(0)).toBe("0.00%");
      expect(formatPercent(0, false)).toBe("0.00%");
    });
  });

  describe("formatQuantity", () => {
    it("should handle null, undefined, and NaN values", () => {
      expect(formatQuantity(null)).toBe("0");
      expect(formatQuantity(undefined)).toBe("0");
      expect(formatQuantity(NaN)).toBe("0");
    });

    it("should handle zero", () => {
      expect(formatQuantity(0)).toBe("0");
    });

    it("should format for order book precision tiers", () => {
      // >= 1000
      expect(formatQuantity(1250.756)).toBe("1,250.76");
      expect(formatQuantity(1000)).toBe("1,000");

      // >= 1
      expect(formatQuantity(9.87654)).toBe("9.8765");
      expect(formatQuantity(1)).toBe("1.0000");

      // >= 0.0001
      expect(formatQuantity(0.056789)).toBe("0.056789");
      expect(formatQuantity(0.0001)).toBe("0.000100");

      // below 0.0001
      expect(formatQuantity(0.000012345)).toBe("0.00001234");
      expect(formatQuantity(0.00000001)).toBe("0.00000001");
    });
  });

  describe("getVendorColor", () => {
    it("should return the correct color for upstox and binance, case-insensitively", () => {
      expect(getVendorColor("Upstox")).toBe("#387ed1");
      expect(getVendorColor("upstox")).toBe("#387ed1");
      expect(getVendorColor("Binance")).toBe("#f3ba2f");
      expect(getVendorColor("BINANCE")).toBe("#f3ba2f");
    });

    it("should return fallback color for unknown vendor", () => {
      expect(getVendorColor("unknown")).toBe("#666");
      expect(getVendorColor("")).toBe("#666");
    });
  });

  describe("formatBrokerAmount", () => {
    it("should handle null, undefined, and NaN values based on vendor", () => {
      expect(formatBrokerAmount(null, "binance")).toBe("$0.00");
      expect(formatBrokerAmount(null, "upstox")).toBe("₹0.00");
      expect(formatBrokerAmount(undefined, "binance")).toBe("$0.00");
      expect(formatBrokerAmount(undefined, "upstox")).toBe("₹0.00");
      expect(formatBrokerAmount(NaN, "binance")).toBe("$0.00");
      expect(formatBrokerAmount(NaN, "upstox")).toBe("₹0.00");
    });

    it("should accept both string and number inputs", () => {
      expect(formatBrokerAmount(123.45, "binance")).toBe("$123.45");
      expect(formatBrokerAmount("123.45", "binance")).toBe("$123.45");
      expect(formatBrokerAmount(123.45, "upstox")).toBe("₹123.45");
      expect(formatBrokerAmount("123.45", "upstox")).toBe("₹123.45");
    });

    it("should handle empty or invalid string inputs", () => {
      expect(formatBrokerAmount("abc", "binance")).toBe("$0.00");
      expect(formatBrokerAmount("", "upstox")).toBe("₹0.00");
    });

    it("should map dollar prefix for binance and rupee prefix for everything else", () => {
      expect(formatBrokerAmount(10.5, "binance")).toBe("$10.50");
      expect(formatBrokerAmount(10.5, "upstox")).toBe("₹10.50");
      expect(formatBrokerAmount(10.5, "other-broker")).toBe("₹10.50");
    });
  });
});
