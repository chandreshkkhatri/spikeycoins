# Agent Collaboration Loop — a portable pattern

A repo-agnostic guide to the two-agent (and solo) collaboration loop used in this
repository, written so you can drop the same mechanism into any other repo. Strip
the project-specific bits (the *verification gates*) and keep the rest verbatim.

---

## 1. What this is / what to call it

Two (or one) autonomous coding agents work down a shared task list by taking turns
through a **plan → implement → review** cycle. They never call each other directly;
they coordinate entirely through **shared files in the repo**, each waking on its
own **timer (cron tick)**, reading the shared state, doing at most one step, and
writing the state back.

There is no single canonical name, but it is a composition of established patterns:

- **Blackboard system** — the defining one. Independent "knowledge sources"
  (agents) collaborate via a shared data structure (the *blackboard* = a status
  file + a task list), not via direct messaging.
- **Choreography** (as opposed to **orchestration**) — no central conductor; each
  agent reacts to shared state autonomously.
- **Stigmergy** — coordination through traces left in a shared medium; each agent's
  edit to the status file is the signal the other reacts to (like ant pheromones).
- **Phase-baton / token passing + finite-state machine** — a single `phase` token
  is handed between roles; only the role that "owns" the current phase may act.
- **Optimistic concurrency + heartbeat lease** — claim-then-verify writes, and a
  staleness timeout that lets the loop self-heal after a crash.

Short description: *a blackboard-based, choreographed multi-agent loop with a
phase-baton state machine and heartbeat recovery.*

---

## 2. Why it works (design rationale)

- **Roles, not threads.** One agent **plans** (writes a plan doc), the other
  **implements** (writes code), and the planner also **reviews** (audits + commits).
  Fixed roles mean no two agents do the same step.
- **The baton prevents races.** Each agent acts *only* on the phase it owns. Two
  agents can both be "paused" without both grabbing the same task, because the
  `phase` field — not "is the other idle?" — decides who's up. (Naively checking
  "is the other paused?" races: when both are paused, both act.)
- **Timers are offset.** The two agents tick on the same period but **out of
  phase** (e.g. one at :05/:35, the other at :20/:50) so their read-modify-write
  windows don't overlap.
- **Atomic writes + claim/re-read.** Status writes go through a temp file + rename;
  before acting an agent re-reads to confirm its claim stuck (optimistic
  concurrency).
- **Heartbeats self-heal.** A `working` status whose heartbeat is older than a
  threshold (e.g. 90 min) is treated as abandoned (crash / quota exhaustion); the
  *other* agent rewinds the phase to the last stable state and continues.
- **Solo mode.** A single agent can run the whole loop when the other is offline —
  same phases, one actor.

---

## 3. File layout (the "blackboard")

All coordination state lives in one directory (here: `collab/`):

| File | Role | Git |
|---|---|---|
| `collab/instructions.md` | The spec each agent re-reads every tick (this pattern, specialized to the repo). | committed |
| `collab/TODO.md` | Shared task stack (LIFO). One line per task. | committed |
| `collab/status.json` | Runtime coordination state (the baton + per-agent heartbeats). | **gitignored** |
| `collab/plans/<slug>.md` | One plan per task, written by the planner. | gitignored |
| `collab/log.md` | Append-only handoff log (observability). | gitignored |

Rule of thumb: **the spec + task list are committed** (they're shared intent);
**the runtime state, plans, and logs are gitignored** (they churn and are local).

`collab/TODO.md` task line format:
```
- [ ] `<id>` | kind: <plan_only|implement> | <title>
```

---

## 4. Shared state schema (`status.json`)

```json
{
  "enabled": false,                 // master switch. false ⇒ every tick is a no-op.
  "mode": "dual",                   // dual | solo_a | solo_b
  "auto_commit": true,              // true ⇒ the loop commits finished, validated work
  "task": {
    "id": "2026-06-22-example",
    "title": "Human-readable title",
    "kind": "implement",            // plan_only ⇒ planner finishes alone (no implement stage)
    "phase": "awaiting_plan",       // the baton — see state machine
    "plan_file": null               // set to collab/plans/<slug>.md when phase → plan_ready
  },
  "agent_a": { "status": "paused", "heartbeat": "<ISO>", "note": "" },  // planner/reviewer
  "agent_b": { "status": "paused", "heartbeat": "<ISO>", "note": "" },  // implementer
  "updated_at": "<ISO>",
  "updated_by": "agent_a|agent_b|user"
}
```
(In this repo `agent_a` = "claude_code" / planner, `agent_b` = "antigravity" /
implementer — rename freely; only the role mapping matters.)

---

## 5. The phase-baton state machine

```
awaiting_plan ─(A)─▶ planning ─(A)─▶ plan_ready ─(B)─▶ implementing ─(B)─▶ awaiting_review
      ▲                                                                          │
      │                                              (A: clean) ─────────────────┤─▶ done ─▶ pop TODO ─▶ awaiting_plan(next) / idle
      └──────────────────────────── (A: issues) ─▶ plan_ready (fix-plan) ◀───────┘
                            blocked ⇠ either agent when human input is needed (both pause)
```

- **Agent A (planner/reviewer)** owns transitions out of `awaiting_plan` and `awaiting_review`.
- **Agent B (implementer)** owns transitions out of `plan_ready`.
- `kind: plan_only` skips the implement stage: `awaiting_plan → planning → done`.
- `blocked` is the explicit "needs a human" state — set it (with a note) when the
  task genuinely can't proceed autonomously; the loop then no-ops until a human
  edits the state.

---

## 6. The tick algorithm

Each agent is driven by a recurring timer. On every fire it runs **one** pass:

```
1. Read status.json and TODO.md.
2. If not enabled → do nothing.
3. If mode says the other agent owns the whole loop → do nothing.
4. Branch on task.phase:

   AGENT A (planner/reviewer):
     awaiting_plan:
        - pick the BOTTOM task from TODO (if too big, split into subtasks,
          append at bottom, take the bottom one)
        - claim: phase→planning, a.status→working, heartbeat, atomic write
        - write collab/plans/<slug>.md (approach, files, verification criteria)
        - set plan_file; phase→plan_ready (or →done if plan_only); a.status→paused
     awaiting_review:
        - claim: phase→reviewing, a.status→working
        - audit: git diff + run the project's VERIFICATION GATES
        - clean  → (if auto_commit) commit scoped (see §7); pop task;
                   tasks left? phase→awaiting_plan : phase→idle
        - issues → write a fix-plan; plan_file=…; phase→plan_ready (with notes)
        - a.status→paused
     planning / reviewing:
        - watchdog: a previous tick aborted mid-step; refresh heartbeat & resume
     plan_ready / implementing  (only in solo mode where A owns everything):
        - run Agent B's logic for that phase verbatim, substituting a.* fields
     otherwise (B's turn, dual mode):
        - staleness check on B: if b.status==working and b.heartbeat older than
          the threshold → rewind phase→plan_ready, b.status→paused, note

   AGENT B (implementer): mirror image —
     plan_ready:
        - claim: phase→implementing, b.status→working
        - read plan_file, implement, run the VERIFICATION GATES
        - success → phase→awaiting_review, b.status→paused
        - blocked → phase→blocked, b.status→paused, note
     implementing: watchdog (resume)
     awaiting_plan/awaiting_review/planning/reviewing (only in solo where B owns all):
        - run Agent A's logic for that phase verbatim, substituting b.* fields
     otherwise (A's turn, dual mode): staleness check on A (rewind→awaiting_plan)
```

**The one project-specific knob is the VERIFICATION GATES** — the commands that
prove a change is safe. Swap in whatever your repo uses, e.g.:
- typed/compiled: `tsc --noEmit`, `cargo check`, `go build ./...`
- tests: `pytest -q`, `npm test`, `go test ./...`
- lint that catches the failure mode of automated refactors (we used
  `ruff --select F821` to catch dropped-import NameErrors).
Everything else in the algorithm is repo-agnostic.

---

## 7. Commit scope (critical — learned the hard way)

The working tree often holds changes unrelated to the current task. So when the
loop commits:

- **Stage only the files the task produced** — the implement step records that
  file list in its status `note`; stage exactly those. **Never `git add -A`/`.`.**
- **Verify staged set** (`git diff --cached --name-only`) matches the expected
  files before committing; unstage anything unexpected.
- **Never bundle loop bookkeeping** (`status.json`, `plans/*`, `TODO.md` pops) into
  a task's code commit.
- Plain commit message, no signature/footer (match the repo's commit conventions).

---

## 8. Solo mode

`mode` ∈ `{dual, solo_a, solo_b}`:
- **dual** — both agents tick; A owns plan/review, B owns implement.
- **solo_a** — Agent A runs *every* phase (plans, implements its own plan, reviews,
  commits). Agent B's tick is an unconditional no-op.
- **solo_b** — mirror.

A solo agent reaching a phase it doesn't normally own just runs that phase's
existing logic (no separate algorithm); the staleness/"otherwise" branch is skipped
(no other agent to watch). Switch modes any time by editing `status.json` — safe
mid-task. **In practice solo mode is the workhorse** (one capable agent on a fast
tick), with dual mode for when you genuinely have two agents.

---

## 9. Driving the timers (and a key gotcha)

Each agent's timer is created **inside its session** and is **session-only** — it
dies when that conversation ends. So **every new session must re-arm the timer**
(bootstrap), and the loop is idle until armed + `enabled:true`.

Bootstrap = create a recurring scheduled job whose prompt is exactly the tick
prompt (and nothing else), e.g.:
> You are Agent A in the collaboration loop. Read `collab/instructions.md`, then
> `collab/status.json`, then execute exactly the "Agent A Tick" algorithm. Do
> nothing else.

Cadence notes:
- Offset the two agents (e.g. `5,35` and `20,50`) in dual mode.
- For solo mode a single cron (e.g. every 10 min) is fine; no offset needed.
- Pick off-round minutes (`3,13,23…` not `0,30`) to avoid fleet-wide load spikes.
- Timers only fire while the session is **idle**, so a long tick just delays the
  next fire — no overlapping ticks. Safe even at short intervals.
- **Delete the cron when done** (and/or set `enabled:false`) so it stops firing on
  an empty queue.

---

## 10. Limits / when to set `blocked`

The loop can only safely complete work it can **verify**. If a task's correctness
can't be proven by the available gates, the agent must `blocked` it for a human
rather than guess. Concrete example from this repo: refactoring drag/drop/keyboard
UI — `tsc` passing does NOT prove the interaction still works. The fix was to
**first build an interaction-test harness** (so the behavior became gate-verifiable),
*then* let the loop do the refactor. General rule: **make it verifiable, or block it.**

---

## 11. Porting checklist (new repo)

1. `mkdir collab/`; add `collab/status.json`, `collab/plans/`, `collab/log.md` to
   `.gitignore`.
2. Copy `collab/instructions.md` (this pattern) and specialize **only**:
   - the agent names / role mapping,
   - the **verification gates** (§6),
   - the commit conventions (§7),
   - the cron cadence (§9).
3. Seed `collab/TODO.md` with a few `- [ ] ...` task lines.
4. Seed `collab/status.json` (`enabled:false`, `mode` as desired, `phase:awaiting_plan`).
5. In each agent session, arm the tick cron (bootstrap prompt), then flip
   `enabled:true`.
6. Watch `collab/log.md` for the handoff trail; pause anytime with `enabled:false`.

---

## 12. Minimal mental model

> A committed **task list** + a gitignored **status file** form a blackboard. A
> **phase token** in the status file says whose turn it is. Two timers wake two
> agents out of phase; each does one plan/implement/review step, verifies with the
> repo's gates, commits only its own files, and hands the token on. Heartbeats
> rewind crashed steps; `blocked` parks anything a human must decide; `enabled`
> and `mode` are the master controls.
