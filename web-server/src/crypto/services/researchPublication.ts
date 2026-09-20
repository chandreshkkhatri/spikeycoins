export const PUBLICATION_POLICY_VERSION = 1;
export interface ResearchEvidence {
  text: string;
  model: string;
  // The installed SDK's legacy grounding types do not match the wire schema.
  // Keep the provider payload intact and validate it at the policy boundary.
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

// Provider support is provenance, not proof of truth or causal attribution.
// Fail closed when any substantive headline/body text lacks provider support.
function covered(text: string, segments: string[]): boolean {
  const target = normalize(text);
  if (!/[\p{L}\p{N}]/u.test(target)) return false;
  const coverage = new Array<boolean>(target.length).fill(false);
  for (const raw of segments) {
    const segment = normalize(decodeSegment(raw));
    if (!segment) continue;
    if (segment.includes(target)) return true;
    let start = target.indexOf(segment);
    while (start >= 0) {
      coverage.fill(true, start, start + segment.length);
      start = target.indexOf(segment, start + 1);
    }
  }
  let offset = 0;
  for (const character of target) {
    if (/[\p{L}\p{N}]/u.test(character) &&
        !coverage.slice(offset, offset + character.length).every(Boolean)) return false;
    offset += character.length;
  }
  return true;
}

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
  if (!sources.size || !covered(result.headline, segments) || !covered(result.researchContent, segments)) {
    return { ...result, publishableReason: "Headline or report lacks complete search-grounding support." };
  }
  return {
    ...result, sources: [...sources.values()], isPublishable: true,
    publishableReason: "Passed structured-output and search-grounding policy v1; not independent fact verification.",
  };
}
