import { describe, it, expect } from "vitest";
import { toSafeNumber, isValidNumber } from "./number-utils";

describe("number-utils", () => {
  describe("toSafeNumber", () => {
    it("should return the number if a valid number is passed", () => {
      expect(toSafeNumber(42)).toBe(42);
      expect(toSafeNumber(-3.14)).toBe(-3.14);
      expect(toSafeNumber(0)).toBe(0);
    });

    it("should parse and return the number if a numeric string is passed", () => {
      expect(toSafeNumber("42")).toBe(42);
      expect(toSafeNumber("-3.14")).toBe(-3.14);
      expect(toSafeNumber("0")).toBe(0);
    });

    it("should return default fallback (0) if null or undefined is passed", () => {
      expect(toSafeNumber(null)).toBe(0);
      expect(toSafeNumber(undefined)).toBe(0);
    });

    it("should return custom fallback if null or undefined is passed and fallback is specified", () => {
      expect(toSafeNumber(null, 10)).toBe(10);
      expect(toSafeNumber(undefined, -1)).toBe(-1);
    });

    it("should return fallback if NaN, Infinity, or non-numeric string is passed", () => {
      expect(toSafeNumber(NaN)).toBe(0);
      expect(toSafeNumber(Infinity)).toBe(0);
      expect(toSafeNumber(-Infinity)).toBe(0);
      expect(toSafeNumber("abc")).toBe(0);
      expect(toSafeNumber("12abc")).toBe(12); // parseFloat("12abc") is 12, which is finite
      expect(toSafeNumber("abc12")).toBe(0); // parseFloat("abc12") is NaN
    });

    it("should respect custom fallback for invalid numbers", () => {
      expect(toSafeNumber(NaN, 99)).toBe(99);
      expect(toSafeNumber(Infinity, 99)).toBe(99);
      expect(toSafeNumber("abc", 99)).toBe(99);
    });
  });

  describe("isValidNumber", () => {
    it("should return true for valid finite numbers", () => {
      expect(isValidNumber(0)).toBe(true);
      expect(isValidNumber(123)).toBe(true);
      expect(isValidNumber(-1.23)).toBe(true);
    });

    it("should return false for NaN, Infinity, and -Infinity", () => {
      expect(isValidNumber(NaN)).toBe(false);
      expect(isValidNumber(Infinity)).toBe(false);
      expect(isValidNumber(-Infinity)).toBe(false);
    });

    it("should return false for non-number types", () => {
      expect(isValidNumber("123")).toBe(false);
      expect(isValidNumber(null)).toBe(false);
      expect(isValidNumber(undefined)).toBe(false);
      expect(isValidNumber({})).toBe(false);
      expect(isValidNumber([])).toBe(false);
      expect(isValidNumber(true)).toBe(false);
    });
  });
});
