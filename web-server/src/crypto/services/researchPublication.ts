export const PUBLICATION_POLICY_VERSION = 1;
export interface ResearchEvidence {
  text: string;
  model: string;
  // Keep the provider grounding payload intact and validate it at the policy boundary.
  grounding: unknown;
  finishReason?: string;
}
export interface PublicationDecision {
  headline: string;
  researchContent: string;
  sources: { type: string; url: string; title?: string }[];
  isPublishable: boolean;
  publishableReason: string;
  category: string;
  impact: "high" | "medium" | "low";
}

export function searchEntryPoint(evidence: ResearchEvidence): string | undefined {
  const metadata = record(evidence.grounding) ? evidence.grounding : {};
  const entry = record(metadata.searchEntryPoint) ? metadata.searchEntryPoint : {};
  return typeof entry.renderedContent === "string" ? entry.renderedContent : undefined;
}

const categories = new Set([
  "Listing/Delisting", "Partnership", "Technical Upgrade", "Tokenomics",
  "Regulatory", "Hack/Exploit", "Ecosystem Growth", "Market Structure",
  "Community Event", "General",
]);
const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from",
  "had", "has", "have", "if", "in", "into", "is", "it", "its", "of", "on", "or",
  "that", "the", "their", "then", "there", "these", "this", "those", "to", "was",
  "were", "will", "with",
]);
const temporalTokens = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december", "today", "tomorrow", "yesterday",
]);
const sentenceLeadWords = new Set([
  "a", "an", "however", "interpretation", "investors", "it", "limitation",
  "looking", "meanwhile", "possible", "that", "the", "these", "this", "those",
  "traders", "uncertainty", "watch", "what",
]);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const safeUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !!url.hostname;
  } catch { return false; }
};
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
function decodeSegment(text: string): string {
  try { return JSON.parse('"' + text + '"') as string; } catch { return text; }
}
function lexicalTokens(text: string): string[] {
  return normalize(text).toLocaleLowerCase().match(/\d+(?:[.,]\d+)*%?|[\p{L}]+(?:['.-][\p{L}\p{N}]+)*/gu) ?? [];
}
function contentTokens(text: string): string[] {
  return lexicalTokens(text).filter(token => !stopWords.has(token));
}
function sentenceList(text: string): string[] {
  return normalize(text).split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}])/u).filter(nonempty);
}
function explicitFactTokens(text: string): string[] {
  const facts = new Set(
    lexicalTokens(text).filter(token => /\p{N}/u.test(token) || temporalTokens.has(token)),
  );
  const capitalized = normalize(text).match(/\b[\p{Lu}][\p{L}\p{N}-]*\b/gu) ?? [];
  for (const token of capitalized) {
    const normalized = token.toLocaleLowerCase();
    if (!sentenceLeadWords.has(normalized)) facts.add(normalized);
  }
  return [...facts];
}

interface GroundingAssessment {
  ratio: number;
  matched: number;
  unsupportedFacts: string[];
  interpretive: boolean;
}

function assessGrounding(text: string, segments: string[]): GroundingAssessment {
  const targetTokens = contentTokens(text);
  const segmentTokens = segments.map(segment => new Set(contentTokens(decodeSegment(segment))));
  const supported = new Set(segmentTokens.flatMap(tokens => [...tokens]));
  const matched = Math.max(0, ...segmentTokens.map(tokens =>
    targetTokens.filter(token => tokens.has(token)).length
  ));
  const unsupportedFacts = explicitFactTokens(text).filter(token => !supported.has(token));
  return {
    ratio: targetTokens.length ? matched / targetTokens.length : 0,
    matched,
    unsupportedFacts: [...new Set(unsupportedFacts)],
    interpretive: /\b(?:may|might|could|appears?|suggests?|uncertain|uncertainty|possible|possibly|likely|risk|watch|monitor|if|would)\b/i.test(text),
  };
}

function groundedClaim(
  assessment: GroundingAssessment,
  minimumRatio: number,
  allowInterpretive: boolean,
): boolean {
  const enoughDirectSupport = assessment.ratio >= minimumRatio && assessment.matched >= 2;
  const boundedInterpretation = allowInterpretive && assessment.interpretive &&
    assessment.matched >= 1 && assessment.unsupportedFacts.length === 0;
  return assessment.unsupportedFacts.length === 0 && (enoughDirectSupport || boundedInterpretation);
}

const percent = (ratio: number): number => Math.round(ratio * 100);

// Provider support is provenance, not proof of truth or causal attribution.
// Require direct support for factual claims while allowing explicitly uncertain
// interpretation that reuses grounded subject matter and introduces no hard facts.
export function evaluatePublication(evidence: ResearchEvidence): PublicationDecision {
  const draft: PublicationDecision = {
    headline: "Research retained as draft",
    researchContent: "The generated report did not meet the publication policy.",
    sources: [], isPublishable: false, publishableReason: "Invalid research response schema.",
    category: "General", impact: "low",
  };
  let parsed: unknown;
  if (!evidence || typeof evidence.text !== "string" || !nonempty(evidence.model)) return draft;
  try {
    const text = evidence.text.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "");
    parsed = JSON.parse(text);
  } catch { return draft; }
  if (!record(parsed) || !nonempty(parsed.headline) || !nonempty(parsed.researchContent) ||
      typeof parsed.isPublishable !== "boolean" || !nonempty(parsed.publishableReason) ||
      typeof parsed.category !== "string" || !categories.has(parsed.category) ||
      typeof parsed.impact !== "string" || !["high", "medium", "low"].includes(parsed.impact) ||
      !Array.isArray(parsed.sources) || !parsed.sources.every(source =>
        record(source) && nonempty(source.type) && safeUrl(source.url) &&
        (source.title === undefined || typeof source.title === "string") &&
        (source.summary === undefined || typeof source.summary === "string"))) return draft;

  const result: PublicationDecision = {
    ...draft, headline: parsed.headline, researchContent: parsed.researchContent,
    category: parsed.category, impact: parsed.impact as PublicationDecision["impact"],
    publishableReason: parsed.publishableReason,
  };
  if (!parsed.isPublishable) return result;
  if (evidence.finishReason !== "STOP") {
    return { ...result, publishableReason: "Generation did not finish normally." };
  }
  const metadata = record(evidence.grounding) ? evidence.grounding : {};
  const chunks: unknown[] = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
  const supports: unknown[] = Array.isArray(metadata.groundingSupports) ? metadata.groundingSupports : [];
  const segments: string[] = [];
  const sources = new Map<string, PublicationDecision["sources"][number]>();
  for (const support of supports) {
    if (!record(support) || !record(support.segment)) continue;
    const segment = support.segment.text;
    // Do not accept metadata describing a different response.
    if (!nonempty(segment) || (!evidence.text.includes(segment) &&
        !evidence.text.includes(JSON.stringify(segment).slice(1, -1)))) continue;
    const indices: unknown[] = Array.isArray(support.groundingChunkIndices) ? support.groundingChunkIndices : [];
    const linked = indices.flatMap(index => {
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0) return [];
      const chunk = chunks[index];
      const web = record(chunk) && record(chunk.web) ? chunk.web : null;
      return web && safeUrl(web.uri)
        ? [{ type: "grounded", url: web.uri, title: typeof web.title === "string" ? web.title : undefined }]
        : [];
    });
    if (!linked.length) continue;
    segments.push(segment);
    linked.forEach(source => sources.set(source.url, source));
  }
  if (!sources.size) {
    return { ...result, publishableReason: "No valid provider-linked search sources." };
  }

  const headline = assessGrounding(result.headline, segments);
  if (!groundedClaim(headline, 0.5, false)) {
    const facts = headline.unsupportedFacts.length
      ? ` Unsupported facts: ${headline.unsupportedFacts.join(", ")}.`
      : "";
    return {
      ...result,
      publishableReason: `Headline search grounding incomplete (${percent(headline.ratio)}% content-token coverage).${facts}`,
    };
  }

  const sentences = sentenceList(result.researchContent);
  for (const [index, sentence] of sentences.entries()) {
    const assessment = assessGrounding(sentence, segments);
    if (!groundedClaim(assessment, 0.45, true)) {
      const facts = assessment.unsupportedFacts.length
        ? ` Unsupported facts: ${assessment.unsupportedFacts.join(", ")}.`
        : "";
      return {
        ...result,
        publishableReason: `Report sentence ${index + 1} lacks search grounding (${percent(assessment.ratio)}% content-token coverage).${facts}`,
      };
    }
  }

  return {
    ...result, sources: [...sources.values()], isPublishable: true,
    publishableReason: "Passed structured-output and claim-oriented search-grounding policy v1; not independent fact verification.",
  };
}
