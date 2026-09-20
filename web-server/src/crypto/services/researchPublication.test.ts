import { describe, expect, it } from "vitest";
import { evaluatePublication, type ResearchEvidence } from "./researchPublication";

export function evidenceFixture(overrides: Record<string, unknown> = {}): ResearchEvidence {
  const headline = "Protocol announces upgrade";
  const researchContent = "The protocol announced an upgrade. The release is scheduled for Friday.";
  return {
    model: "fixture-model", finishReason: "STOP",
    text: JSON.stringify({
      headline, researchContent, sources: [{ type: "news", url: "https://invented.example/report" }],
      isPublishable: true, publishableReason: "Announcement found", category: "Technical Upgrade", impact: "medium",
      ...overrides,
    }),
    grounding: {
      webSearchQueries: ["protocol announcement"],
      groundingChunks: [{ web: { uri: "https://primary.example/announcement", title: "Announcement" } }],
      groundingSupports: [headline, researchContent].map(text => ({
        segment: { text }, groundingChunkIndices: [0],
      })),
    },
  };
}

describe("publication policy", () => {
  it("publishes supported text using provider URLs, never generated URLs", () => {
    const result = evaluatePublication(evidenceFixture());
    expect(result.isPublishable).toBe(true);
    expect(result.sources.map(source => source.url)).toEqual(["https://primary.example/announcement"]);
  });
  it.each([
    { isPublishable: "false" }, { isPublishable: 1 }, { impact: ["high"] },
    { sources: "fake" }, { sources: [{ type: "news", url: "javascript:alert(1)" }] },
    { researchContent: "" }, { category: "Invented category" },
  ])("rejects malformed structured output %j", overrides => {
    expect(evaluatePublication(evidenceFixture(overrides)).isPublishable).toBe(false);
  });
  it("does not overrule a negative model decision", () => {
    expect(evaluatePublication(evidenceFixture({ isPublishable: false })).isPublishable).toBe(false);
  });
  it.each([null, {}, { groundingChunks: [], groundingSupports: [] }, { groundingSupports: "broken" }])(
    "rejects absent or malformed grounding %j", grounding => {
      expect(evaluatePublication({ ...evidenceFixture(), grounding }).isPublishable).toBe(false);
    },
  );
  it("rejects support for only part of the report", () => {
    const evidence = evidenceFixture({ researchContent: "The protocol announced an upgrade. Price will double tomorrow." });
    expect(evaluatePublication(evidence).isPublishable).toBe(false);
  });
  it("rejects invalid chunk indices and unsafe provider URLs", () => {
    for (const index of [-1, 3, 0.5]) {
      const evidence = evidenceFixture();
      evidence.grounding = {
        groundingChunks: [{ web: { uri: "https://primary.example" } }],
        groundingSupports: [{ segment: { text: evidence.text }, groundingChunkIndices: [index] }],
      };
      expect(evaluatePublication(evidence).isPublishable).toBe(false);
    }
    const evidence = evidenceFixture();
    evidence.grounding = {
      groundingChunks: [{ web: { uri: "javascript:alert(1)" } }],
      groundingSupports: [{ segment: { text: evidence.text }, groundingChunkIndices: [0] }],
    };
    expect(evaluatePublication(evidence).isPublishable).toBe(false);
  });
  it("keeps malformed or incomplete generations as drafts", () => {
    expect(evaluatePublication({ ...evidenceFixture(), text: "{broken" }).isPublishable).toBe(false);
    expect(evaluatePublication({ ...evidenceFixture(), finishReason: "MAX_TOKENS" }).isPublishable).toBe(false);
  });
  it("rejects metadata belonging to different response text", () => {
    expect(evaluatePublication(evidenceFixture({
      headline: "Another asset", researchContent: "Unrelated claim.",
    })).isPublishable).toBe(false);
  });
});
