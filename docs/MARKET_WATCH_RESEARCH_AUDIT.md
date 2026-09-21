# Market Watch — Research Criteria and Methodology Audit

Date: 2026-09-20  
Scope: research selection, market measurements, evidence, publication and presentation.

## Verdict

Market Watch is a useful discovery surface with an AI-assisted catalyst feed.
It is not yet a reproducible, evidence-gated research methodology, and its
impact labels are not validated measures of confidence or trading opportunity.

The strongest next step is to make publication and evidence trustworthy,
not add more indicators or a composite opportunity score.

The audit phase did not change application behavior. See the implementation
checkpoint below for subsequent changes. Terminal remains deferred.

## Evidence and limits

Reviewed ResearchService, AIClient, research storage, cron/admin entry points,
DataManager, DailyCandlestickService, MarketOverviewService, screener filters
and MarketSummary. Checked Google's current grounding documentation.

In-memory execution of the actual transpiled ResearchService, with AI, database
and data providers mocked, reproduced:

- Input returns +8%, +5%, +2% produce six selection entries: all three assets as
  gainers and the same assets in reverse as losers. Later symbol deduplication
  removes duplicate candidates; the selector still does not enforce direction.
- On-demand research with model output `isPublishable: false` and `sources: []`
  saves publishable research and creates a published summary.
- The implemented daily reference implies a 186-hour interval at 18:00 UTC.

No live research jobs, paid AI calls, orders or production database writes were
performed. No sample of production articles was fact-checked: these findings
establish implementation risks, not a measured hallucination rate. Existing
presentation/data tests do not establish research quality.

## Current methodology, as implemented

1. Universe: Binance USDT Spot tickers plus Futures-only symbols; Spot takes
   precedence for overlapping symbols. Ingestion volume floors are 1,000 USDT
   for Spot and 50,000 USDT for Futures-only instruments.
2. Every two hours, select the top/bottom three 24h movers and up to five
   positive/negative 7d movers.
3. Deduplicate by stripped symbol, retaining whichever horizon has the larger
   absolute percentage change.
4. Skip anything researched within two hours. Within the default six-hour
   dedup window, skip if the return changed by less than ten percentage points.
5. Ask an AI model, with search enabled, whether a coin-specific catalyst exists.
   Broad-market/macro moves and unsupported hype are excluded by the prompt.
6. Ask for a 3–5 sentence report, source URLs, category, impact and a publication
   decision. Store it; automatically publish if the generated flag is truthy.
7. Admin single-coin research bypasses that decision and always publishes.
8. Display ten published summaries, ordered by summary creation time, with
   AI-assistance labels, source links and publication-relative age.

The screener's user-selected minimum volume/move thresholds do **not** govern
the automated research job. Research criteria and interactive scan criteria
are currently separate.

## Findings

### R-01 — P0: publication can bypass evidence entirely

[ResearchService.ts](../web-server/src/crypto/services/ResearchService.ts),
`researchSingleCoin` (around line 857), forces publication after research,
including the non-publishable parser fallback. The on-demand path is
admin-authorized; the problem is editorial validation, not unauthorized access.

**Acceptance:** automated and manual requests use the same publication gate.
Manual requests may produce private drafts or an explicit “no verified
catalyst” result; a manual trigger must not itself count as evidence.

### R-02 — P0: generated citations are not verified evidence

[AIClient.ts](../web-server/src/crypto/utils/aiClient.ts) enables Google Search
but returns only `response.text()` (around lines 50–79). ResearchService accepts
the URLs generated inside that text. There is no minimum source count,
claim-to-source mapping, source-date validation or evidence-based publication
validator. JSON parsing with a TypeScript cast is not runtime schema validation;
`parsedResponse.isPublishable || false` also accepts truthy non-booleans.

Google documents search queries, source chunks and claim-support mappings in
[groundingMetadata](https://ai.google.dev/gemini-api/docs/generate-content/google-search).
The current wrapper discards that evidence. Enabling search does not prove that
every claim was searched or supported.

**Acceptance:** preserve grounding metadata; strictly validate the report schema;
require traceable support for material claims and valid source identities/dates.
Unverified or malformed output stays unpublished. A primary-source requirement
should have a documented exception/review path, not an invented link.

### R-03 — P1: research does not enforce fresh, eligible inputs

ResearchService reads `DataManager.getAllTickers()` without checking
`last_updated`, finite positive prices/volumes or a research-specific liquidity
rule. [DataManager.ts](../web-server/src/crypto/core/DataManager.ts) retains
tickers until its 24-hour stale cleanup threshold; that is not a suitable
research freshness gate. Research selection only filters NaN/zero returns.
The low ingestion floors are not assessments of executable liquidity.

**Acceptance:** snapshot the eligible universe, reject stale/invalid inputs,
record exclusion reasons and distinguish 24h turnover from spread/depth.
Choose and document liquidity thresholds rather than treating ingestion
defaults or a user's screener settings as a research policy.

### R-04 — P1: return horizons and venue coverage are inconsistent

[DailyCandlestickService.ts](../web-server/src/crypto/services/DailyCandlestickService.ts)
compares current prices to the daily open at UTC midnight seven days earlier
(around lines 280–334). Its “7d” duration therefore varies from 168 to nearly
192 hours. Backfill uses Spot klines even though current data can include
Futures-only instruments. Missing history and genuine zero returns are both
removed from results.

**Acceptance:** choose a rolling 168-hour return or explicitly name the calendar
reference. Store period start/end, venue and coverage. Use matching venue
history and distinguish “no history,” “zero return” and “fetch failed.”

### R-05 — P1: top-mover selection has bias and a sign bug

The 24h selector slices the sorted list without positive/negative filtering
(ResearchService around lines 100–101). Combining 24h and 7d candidates by raw
absolute return compares different horizons and can discard meaningful
short-term reversals. Research is selected after a large move; it is a
retrospective catalyst search, not evidence of predictive ability.

**Acceptance:** enforce sign, retain both horizons and selection reasons,
and make quota allocation explicit. If benchmark-relative moves or volume
surprises are added, calculate them on matched windows with documented
baselines; do not label them causal evidence or validated alpha.

### R-06 — P1: novelty is inferred from price instead of evidence

The unconditional two-hour skip precedes any assessment of new developments.
The six-hour check uses an absolute difference in return of ten percentage
points, not a 10% relative change. New exploits, corrections or announcements
can therefore be missed without a sufficiently changed return.

**Acceptance:** separate cost throttling from event freshness. Use event/source
identity, publication timestamps and correction status for novelty; permit
urgent reassessment and record why a candidate was skipped.

### R-07 — P1: the narrative prompt encourages unsupported causality

The prompt asks why price moved, starts the report with “the catalyst,” and
requests actionable follow-ups, including support/resistance, without supplying
a technical-level calculation. It excludes broad-market explanations instead
of distinguishing them from token-specific explanations. Source publication,
event time and price observation time are not required structured fields.

**Acceptance:** separate observed move, verified event and explanatory
hypothesis. Allow “no verified catalyst,” market-wide and mixed-driver results.
Require temporal fit and alternative explanations; unsupported technical
levels/targets must not be invented.

### R-08 — P1: publication lifecycle can retain invalidated research

When updated research becomes non-publishable, the update path does not unpublish
its existing Summary (around lines 726–752). The public reader filters only
`Summary.isPublished`, then populates the current research, so rejected content
can remain visible. Sorting by `createdAt` while displaying `publishedAt`
also means a newly revised story may not surface among the latest ten.

**Acceptance:** atomically transition draft/published/corrected/retracted state,
retain revisions and filter public results consistently. Define ordering by
publication or substantive revision, rather than incidental document creation.

### R-09 — P2: research is not reproducible or calibrated

[Research.ts](../web-server/src/crypto/models/Research.ts) stores content,
sources and timestamps, but no model/prompt/methodology version, immutable input
snapshot, source-event timestamps, claim evidence or confidence rubric.
“High/medium/low” impact is assigned by the model without defined anchors.
Automated symbols are stripped (BTC) while on-demand symbols keep the pair
(BTCUSDT), fragmenting identity and research history.

**Acceptance:** canonical asset + instrument + venue IDs; versioned inputs,
evidence and report revisions; separate evidence confidence from event
materiality. Avoid numerical confidence percentages without calibration.

### R-10 — P2: failure states and quality evaluation are incomplete

Pre-screening catches its own errors and returns “proceed,” so the outer quota
handler generally cannot observe those failures. JSON parse failures instead
look like “no event.” Operational failure and an evidence-based negative result
are not separate durable outcomes. No ResearchService/AIClient-specific test
files were found.

The UI's AI label, caveat and supporting-source list are useful improvements,
but cannot compensate for these pipeline gaps. Article age is publication age,
not source/event age, and there is no explicit research expiry policy.

**Acceptance:** durable statuses for researched/no catalyst/deferred/error;
bounded quota backoff; candidate coverage and exclusion reporting; fixtures for
malformed output, empty grounding, wrong assets, stale events, contradictory
sources, publication overrides and retractions. Measure source accuracy and
claim support through human-reviewed samples before optimizing throughput.

## Recommended research criteria

Treat eligibility and evidence as hard gates, not points that a large price
move can outweigh.

| Criterion | Required assessment |
| --- | --- |
| Identity and universe | Exact asset, instrument and venue; documented inclusion/exclusion policy |
| Measurement integrity | Fresh, finite observations; explicit time windows and history coverage |
| Investigative relevance | Move magnitude, matched benchmark context and liquidity; clear selection reason |
| Evidence quality | Traceable primary evidence where available; independent corroboration for disputed claims |
| Temporal fit | Event and source-publication times compared with the observed move |
| Interpretation | Facts separated from hypotheses; alternative drivers and contradictory evidence |
| Materiality | Explain token-specific supply, demand, access, security or governance relevance |
| Uncertainty | Evidence-confidence rubric distinct from impact; “unknown” is a valid result |
| Lifecycle | Event-based deduplication, expiry, corrections, retractions and reproducible revisions |

Suggested output: **Observed move → Verified event → Possible connection →
Evidence/confidence → Counterevidence/limitations → What to monitor.**

“Potential catalyst supported by sources” is a more defensible outcome than
“this is why price moved.” Do not introduce a single opportunity score until
the underlying criteria and reviewer agreement have been tested.

## Recommended implementation order — not yet implemented

1. **Publication integrity:** one strict gate, no admin bypass, real grounding,
   runtime schema checks, and consistent retraction behavior (R-01/02/08).
2. **Measurement and candidate contract:** fresh eligible inputs, venue-correct
   windows/history, sign-correct rankings, canonical identity and retained
   multi-horizon context (R-03/04/05).
3. **Research methodology:** factual timeline, alternatives, evidence rubric,
   event-driven novelty, explicit negative/error outcomes and a versioned
   evaluation set (R-06/07/09/10).

These are proposed Market Watch follow-ups, not changes to Terminal's deferred
backlog or authorization to generate/publish live research.

## Implementation checkpoint — publication integrity v1

Implemented after the audit:

- Manual and automated research use the same publication policy; admin requests
  no longer force publication. Drafts remain stored for inspection and their
  status/reason is returned to the screener.
- AI responses preserve model identity, finish reason and complete provider
  grounding metadata. The installed SDK has outdated grounding declarations;
  the policy validates the actual wire structure instead of trusting those types.
- Runtime validation requires the expected report fields, boolean publication
  decision, known category/impact and safe HTTPS source URLs. Parsing failures,
  truncated responses and absent/malformed grounding fail closed.
- Publication requires provider-linked support covering the substantive text of
  both headline and report. Public links come from provider grounding chunks,
  not model-authored URLs. Partial coverage stays a draft. This conservative
  policy can under-publish valid paraphrases or responses whose grounding metadata
  is absent; it must not be relaxed silently to make the feed look populated.
- Evidence and policy version are persisted. The public query joins and filters
  qualifying research before its limit, sorts by publication time, and rechecks
  evidence before returning content. Legacy stories without v1 evidence are
  hidden, not deleted; no migration or live re-research was run.
- A rejected automated revision updates research first, then retracts associated
  summaries. The public read gate prevents exposure if the summary write fails.
  This is fail-closed visibility, not a claim of transactional multi-document
  updates or immutable revision history.
- Provider search suggestions are exposed in the source dialog using a
  script-disabled, cross-origin sandbox with a restrictive CSP.

Verification: 149 backend tests, 163 UI tests, frontend/backend type checks,
new backend policy/test lint, and an intercepted Chromium journey covering
draft messaging and hostile-script isolation in source suggestions. Changed UI
lint has no errors; the existing TanStack/React Compiler warning remains.
No live AI requests, database changes, orders or environment-file reads.

R-01 is addressed. R-02's strict schema/grounding safeguards and R-08's public
visibility/retraction safeguards are implemented, but those broader audit items
remain partially open. Grounding establishes attribution, not independent truth,
source authority, publication date, primary-source status, event identity or
price causality. Full source/date verification, factual review, reproducible
revision history, candidate freshness, return windows, ranking and novelty rules
are still follow-up work.

## Implementation checkpoint — candidate selection v1

- Automated and manual research require valid positive prices, finite returns,
  and observations less than five minutes old (future timestamps are rejected).
- Existing turnover floors are explicit: 1,000 USDT for Spot and 50,000 USDT
  for Futures-only instruments. These are eligibility floors, not validated
  execution-liquidity criteria or recommendations.
- 24h rankings enforce direction, exclude zero/non-finite returns and break
  ties by symbol. Ineligible rows are removed before ranking.
- Both 24h and calendar-seven-day candidates survive per-symbol deduplication.
  This can increase research calls up to the existing combined quota of sixteen
  instrument/horizon candidates; return magnitudes from different windows no
  longer compete directly.
- Newly selected automated candidates use full USDT pair symbols, matching
  manual research. Recent-research lookup also recognizes legacy stripped
  symbols; no database migration was performed.
- Seven-day research ranks the full eligible Spot universe, rather than filtering
  a pre-truncated top-five list. Futures-only candidates are excluded from this
  horizon because its history provider currently uses Spot candles.

This checkpoint does not change the public screener's return calculations.
The calendar-based seven-day reference still spans 168–192 hours; rolling-window
or explicit calendar-window presentation, venue-correct historical storage,
durable exclusion reports and event-driven novelty remain open. No live
research jobs or environment-file reads were performed.

## Implementation checkpoint — explicit UTC calendar window

The existing `7d` key now explicitly means price change from the Spot daily open
at 00:00 UTC seven calendar days before calculation. It is **not** a rolling
168-hour return. The screener, mover panel, research story labels and both AI
research prompts disclose this convention. Existing API keys remain compatible.

- Reference lookup and backfill checks require the exact UTC candle timestamp;
  adjacent candles are not substitutes.
- Calculation uses normalized, fresh Spot ticker values and finite positive
  historical opens. Futures-only instruments are excluded from Spot backfills
  and calculations. No history migration or additional provider was introduced.
- Missing/invalid history is unavailable, not a zero return. A genuine zero is
  retained by the calculation but remains outside directional mover lists.
- Calculated rows carry `referenceTime`, `observedAt` and
  `windowMethod: utc-calendar-7d`; prompts include reference/observation times.
  Persisting these inputs as immutable research provenance is still pending.
- UTC-midnight rollover, invalid references, stale observations, venue exclusion
  and the visible explanation have regression coverage.

Rolling 168-hour history, venue-keyed storage, the existing sampled backfill
coverage policy and reproducible research snapshots remain follow-up work.
No live research, database migration or environment-file reads were performed.

## Implementation checkpoint — research input snapshots v1

New manual and automated reports persist `inputSnapshot`, containing a unique
snapshot ID, schema/policy versions, capture and observation timestamps, full
pair symbol, Spot/Futures venue, horizon and window method, price, observed
percentage return and USDT turnover. Seven-day snapshots include the exact daily
open and reference timestamp; 24h snapshots retain exchange open price and
window timestamps when provided. Unavailable fields are null, never inferred
from rounded returns. Observation time is local ingestion time, distinguished
from the exchange close timestamp.

`inputSnapshotHistory` starts with the initial report's snapshot. Replacing a
report atomically sets its current snapshot and appends the replacement inputs
using `$push`, preserving earlier entries. Timestamp-only checks and research
not adopted as a replacement leave both snapshot fields unchanged. Legacy rows
remain without snapshots until new research replaces them; missing past inputs
are not backfilled. These fields are stored internally; no new public API or UI
was added.

This is application-level append-only **input history**, not database-enforced
immutability or full report/evidence revision history. It does not preserve
discarded AI attempts or guarantee deterministic AI replay. Separate revision
storage, concurrent-run ordering and retention/size policy remain follow-ups.
No live research, database migration or environment-file reads were performed.

## Implementation checkpoint — report/evidence revisions v1

The current report now carries a revision number (new reports start at one).
Before replacing it, the service archives the previous report in the separate
`ResearchRevision` collection with a unique `(researchId, revision)` index.
Archives retain the headline, body, source list, original AI evidence, publication
decision/reason/policy version, classification, timestamps and input snapshot.
Historical snapshot arrays are not recursively copied. The current report plus
its archived predecessors form the available version history.

- Archive writes use `$setOnInsert`; retrying does not overwrite archived content.
- Archive failure stops replacement. A conditional revision check prevents a
  stale writer from replacing a newer report; a conflict stops summary changes.
- Legacy reports without revision numbers are archived as revision zero when
  replaced. Their missing evidence/inputs remain missing. Older versions already
  overwritten before this implementation cannot be recovered.
- A crash after archiving but before replacement may leave an archive of the
  still-current version. This is safe to retry; an archive alone is not proof that
  replacement or publication succeeded.

This adds internal storage, not a public history endpoint or review UI. Archive
immutability is an application/Mongoose safeguard, not protection against direct
database administration. There is no cross-collection transaction: summary writes
remain separate, and concurrent summary ordering/reconciliation is still open.
Discarded AI attempts, source retrieval snapshots, retention/size policy and a
history viewer remain follow-ups. No live database or research job was run;
regression tests mock writes and validate schemas without a database.

## Implementation checkpoint — revision-bound publication

Publication records now belong to `(researchId, researchRevision)` and are
written with `$setOnInsert`. A partial unique index covers versioned records
without imposing uniqueness on existing unversioned summaries. Accepted drafts
also receive a non-published revision record on replacement. No research run
updates or retracts another revision's publication record.

The public feed matches publication revision to current research revision before
sorting/limiting, then rechecks current publication flags and grounding. This
prevents delayed older publication/retraction writes from changing the visibility
of a newer report. Replacing a published report with a draft hides it through the
authoritative research gate even before the draft publication record is written.
Old records remain stored but cannot represent newer revisions.

Rollout: unversioned summary/research pairs retain their existing gated behavior.
An unversioned summary attached to a versioned report is hidden because its
revision cannot be verified. No guessed backfill or live migration was run.
Deployments with automatic indexing disabled must create the declared partial
unique index before relying on publication identity uniqueness.

A failed publication write is surfaced; the report may already be committed,
and stays hidden until its matching record exists. Automatic reconciliation of
these gaps and rollout-era unbound summaries remains a follow-up (there is no
new retry/reconciliation worker in this slice). Cross-collection writes remain
non-transactional. Tests cover delayed older publish/retract records, mismatched
and current feed revisions, and schema/index declarations without a live DB.

## Implementation checkpoint — claim-oriented grounding correction

The publication gate no longer requires every alphanumeric character in the full prose to occur verbatim in provider grounding spans. It now evaluates the headline and each report sentence using content-token overlap, requires all explicit numbers, dates and named entities to occur in grounded spans, and permits only clearly uncertain interpretation that reuses grounded subject matter without introducing new hard facts. Valid provider-linked HTTPS sources remain mandatory, generated source URLs remain untrusted, and malformed or mismatched grounding still fails closed. Rejection reasons now identify missing sources, headline coverage, or the first unsupported report sentence. The prompt was aligned with these rules. This is a documented correction to publication policy v1, not independent fact verification or source-authority validation.
