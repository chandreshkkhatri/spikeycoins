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

function replaceGrounding(evidence: ResearchEvidence, segments: string[]): ResearchEvidence {
  return {
    ...evidence,
    grounding: {
      groundingChunks: [{ web: { uri: "https://primary.example/announcement", title: "Announcement" } }],
      groundingSupports: segments.map(text => ({ segment: { text }, groundingChunkIndices: [0] })),
    },
  };
}

describe("publication policy", () => {
  it("publishes supported text using provider URLs, never generated URLs", () => {
    const result = evaluatePublication(evidenceFixture());
    expect(result.isPublishable).toBe(true);
    expect(result.sources.map(source => source.url)).toEqual(["https://primary.example/announcement"]);
  });
  it("accepts grounded paraphrases and bounded interpretation without new hard facts", () => {
    const headline = "Protocol upgrade moves closer";
    const researchContent =
      "The protocol announced an upgrade for its network. Traders should watch upgrade implementation risk.";
    const evidence = replaceGrounding(
      evidenceFixture({ headline, researchContent }),
      ["Protocol", "upgrade", "The protocol announced an upgrade"],
    );
    const result = evaluatePublication(evidence);
    expect(result.isPublishable).toBe(true);
    expect(result.publishableReason).toContain("claim-oriented");
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
  it("reports which sentence lacks grounding", () => {
    const researchContent = "The protocol announced an upgrade. Price will double tomorrow.";
    const evidence = replaceGrounding(
      evidenceFixture({ researchContent }),
      ["Protocol announces upgrade", "The protocol announced an upgrade"],
    );
    const result = evaluatePublication(evidence);
    expect(result.isPublishable).toBe(false);
    expect(result.publishableReason).toContain("Report sentence 2");
    expect(result.publishableReason).toContain("tomorrow");
  });
  it("rejects unsupported numbers even in explicitly interpretive prose", () => {
    const researchContent =
      "The protocol announced an upgrade. Traders should watch a possible 25% price target.";
    const evidence = replaceGrounding(
      evidenceFixture({ researchContent }),
      ["Protocol announces upgrade", "The protocol announced an upgrade"],
    );
    const result = evaluatePublication(evidence);
    expect(result.isPublishable).toBe(false);
    expect(result.publishableReason).toContain("25%");
  });
  it("explains when no valid provider-linked source exists", () => {
    const evidence = evidenceFixture();
    evidence.grounding = {
      groundingChunks: [],
      groundingSupports: [{ segment: { text: evidence.text }, groundingChunkIndices: [0] }],
    };
    expect(evaluatePublication(evidence).publishableReason)
      .toBe("No valid provider-linked search sources.");
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
