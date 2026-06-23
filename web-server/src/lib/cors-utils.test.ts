import { describe, it, expect } from "vitest";
import { isOriginAllowed } from "./cors-utils";

describe("CORS Origin Validation (isOriginAllowed)", () => {
  const allowedOrigins = [
    "http://localhost:3000",
    "https://spikeycoins.com",
    "https://custom-preview.vercel.app",
  ];

  describe("when origin is missing (falsy)", () => {
    it("should allow undefined origin", () => {
      expect(isOriginAllowed(undefined, { allowedOrigins, isProduction: true })).toBe(true);
      expect(isOriginAllowed(undefined, { allowedOrigins, isProduction: false })).toBe(true);
    });

    it("should allow empty origin", () => {
      expect(isOriginAllowed("", { allowedOrigins, isProduction: true })).toBe(true);
      expect(isOriginAllowed("", { allowedOrigins, isProduction: false })).toBe(true);
    });
  });

  describe("in development mode (isProduction = false)", () => {
    const opts = { allowedOrigins, isProduction: false };

    it("should allow any localhost origin", () => {
      expect(isOriginAllowed("http://localhost:3000", opts)).toBe(true);
      expect(isOriginAllowed("http://localhost:8000", opts)).toBe(true);
      expect(isOriginAllowed("https://localhost:8443", opts)).toBe(true);
    });

    it("should allow explicitly listed non-localhost origins", () => {
      expect(isOriginAllowed("https://spikeycoins.com", opts)).toBe(true);
    });

    it("should reject unlisted vercel.app domains", () => {
      expect(isOriginAllowed("https://another-preview.vercel.app", opts)).toBe(false);
    });

    it("should allow explicitly listed vercel.app domains", () => {
      expect(isOriginAllowed("https://custom-preview.vercel.app", opts)).toBe(true);
    });

    it("should reject general unlisted origins", () => {
      expect(isOriginAllowed("https://malicious.com", opts)).toBe(false);
    });
  });

  describe("in production mode (isProduction = true)", () => {
    const opts = { allowedOrigins, isProduction: true };

    it("should only allow localhost origins if explicitly listed", () => {
      expect(isOriginAllowed("http://localhost:3000", opts)).toBe(true);
      expect(isOriginAllowed("http://localhost:8000", opts)).toBe(false);
    });

    it("should allow explicitly listed non-localhost origins", () => {
      expect(isOriginAllowed("https://spikeycoins.com", opts)).toBe(true);
    });

    it("should reject unlisted vercel.app domains", () => {
      expect(isOriginAllowed("https://another-preview.vercel.app", opts)).toBe(false);
    });

    it("should allow explicitly listed vercel.app domains", () => {
      expect(isOriginAllowed("https://custom-preview.vercel.app", opts)).toBe(true);
    });

    it("should reject general unlisted origins", () => {
      expect(isOriginAllowed("https://malicious.com", opts)).toBe(false);
    });
  });
});
