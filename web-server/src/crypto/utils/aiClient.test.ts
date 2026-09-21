import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import AIClient from "./aiClient";
const mock = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mock.generate };
  },
}));
vi.mock("./logger", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("GEMINI_API_KEY", "test-only"); });
afterEach(() => vi.unstubAllEnvs());
describe("AI evidence envelope", () => {
  it("retains grounding, model and finish reason without changing text callers", async () => {
    const groundingMetadata = { groundingChunks: [{ web: { uri: "https://example.com" } }] };
    mock.generate.mockResolvedValue({
      text: "answer", candidates: [{ groundingMetadata, finishReason: "STOP" }],
    });
    const client = new AIClient("fixture-model");
    expect(await client.generateWithEvidence("test", { useWebSearch: true })).toEqual({
      text: "answer", model: "fixture-model", grounding: groundingMetadata, finishReason: "STOP",
    });
    expect(mock.generate).toHaveBeenCalledWith(expect.objectContaining({
      model: "fixture-model",
      contents: "test",
      config: expect.objectContaining({ tools: [{ googleSearch: {} }] }),
    }));
    expect(await client.generateCompletion("test")).toBe("answer");
  });
  it("does not fabricate missing grounding", async () => {
    mock.generate.mockResolvedValue({ text: "answer", candidates: [{ finishReason: "STOP" }] });
    expect((await new AIClient("fixture").generateWithEvidence("test")).grounding).toBeNull();
  });
});
