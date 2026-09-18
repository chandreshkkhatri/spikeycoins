import { describe, it, expect } from "vitest";
import { SETUP_TYPES, CLASSIFICATION_PROFILES, SCORE_COMPONENTS, RULES_VERSION } from "./methodology";

describe("Methodology Rules Module", () => {
  it("has a valid version string", () => {
    expect(RULES_VERSION).toBe("1.0.0");
  });

  it("ensures setup type IDs are unique", () => {
    const ids = SETUP_TYPES.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("ensures classification profile IDs are unique", () => {
    const ids = CLASSIFICATION_PROFILES.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("ensures score component weights sum to exactly 100", () => {
    const totalWeight = Object.values(SCORE_COMPONENTS).reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBe(100);
  });
});
