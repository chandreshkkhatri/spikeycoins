# Agent Collaboration Loop — Spikey Coins Repository Spec

This is the repository-specific coordination guide for the two-agent (and solo) autonomous loop in Spikey Coins.

---

## 1. Role & Agent Mapping

- **Agent A (Planner/Reviewer):** `claude_code`
  - *Responsibilities:* Picks tasks from `collab/TODO.md`, writes plans to `collab/plans/<slug>.md`, audits completed work, runs verification gates, stages/commits verified code, and pops tasks from the TODO stack.
- **Agent B (Implementer):** `antigravity`
  - *Responsibilities:* Reads the active plan, implements the code changes, runs verification gates locally, and marks the task as ready for review.

---

## 2. File Layout (The Blackboard)

All coordination state lives in the `collab/` directory:

| File | Role | Git |
|---|---|---|
| `collab/instructions.md` | This specification file. | committed |
| `collab/TODO.md` | Shared task stack (LIFO). One line per task. | committed |
| `collab/status.json` | Runtime coordination state (the baton + heartbeats). | **gitignored** |
| `collab/plans/<slug>.md` | One plan per task, written by the planner. | gitignored |
| `collab/log.md` | Append-only handoff log (observability). | gitignored |

`collab/TODO.md` task line format:
```markdown
- [ ] `<id>` | kind: <plan_only|implement> | <title>
```

---

## 3. Shared State Schema (`status.json`)

```json
{
  "enabled": false,                 // Master loop switch. false => ticks are no-ops.
  "mode": "solo_b",                 // dual | solo_a | solo_b (solo_b represents antigravity running the loop)
  "auto_commit": true,              // true => commit completed/verified work automatically
  "task": {
    "id": "2026-06-23-task-id",
    "title": "Task description",
    "kind": "implement",            // plan_only | implement
    "phase": "awaiting_plan",       // awaiting_plan | planning | plan_ready | implementing | awaiting_review | done | blocked
    "plan_file": null               // Path to collab/plans/<slug>.md
  },
  "agent_a": { "status": "paused", "heartbeat": "<ISO_TIMESTAMP>", "note": "" },
  "agent_b": { "status": "paused", "heartbeat": "<ISO_TIMESTAMP>", "note": "" },
  "updated_at": "<ISO_TIMESTAMP>",
  "updated_by": "agent_a|agent_b|user"
}
```

---

## 4. State Machine Transitions

```
awaiting_plan ─(A)─▶ planning ─(A)─▶ plan_ready ─(B)─▶ implementing ─(B)─▶ awaiting_review
      ▲                                                                          │
      │                                              (A: clean) ─────────────────┤─▶ done ─▶ pop TODO ─▶ awaiting_plan(next) / idle
      └──────────────────────────── (A: issues) ─▶ plan_ready (fix-plan) ◀───────┘
                            blocked ⇠ either agent when human input is needed (both pause)
```

- **Agent A (`claude_code`)** transitions out of `awaiting_plan` and `awaiting_review`.
- **Agent B (`antigravity`)** transitions out of `plan_ready`.
- `blocked`: Set by either agent when human decision/intervention is needed.
- In **solo mode** (e.g. `solo_b`), the single active agent runs all transitions.

---

## 5. Verification Gates

Before transition to `awaiting_review` (by B) or `done` (by A), the active agent must run and pass the following gate matrices:

### Frontend Verification (under `ui/`)
1. **Tests:**
   ```bash
   cd ui && npm run test
   ```
2. **TypeScript Compilation:**
   ```bash
   cd ui && npx tsc --noEmit
   ```
3. **Linter Check:**
   ```bash
   cd ui && npx eslint src
   ```

### Backend Verification (under `web-server/`)
1. **Tests:**
   ```bash
   cd web-server && npm run test
   ```
2. **TypeScript Compilation:**
   ```bash
   cd web-server && npm run type-check
   ```
3. **Production Compilation Build:**
   ```bash
   cd web-server && npm run build
   ```
4. **Linter Check:**
   ```bash
   cd web-server && npm run lint
   ```

---

## 6. Commit Conventions

When `auto_commit` is `true`, Agent A (or the solo agent) must stage and commit the work:
- **Stage only target files:** Stage *only* the specific files changed or added as part of the task (usually documented in the task notes). Do **not** run `git add -A` or `git add .`.
- **Exclude loop metadata:** Never include `collab/status.json`, `collab/plans/*`, `collab/log.md`, or `collab/TODO.md` in the task code commit.
- **Commit message format:** Plain, descriptive commit messages matching the repo style, e.g.:
  ```
  feat(web-server): implement Trailing Stop Loss order monitor
  ```

---

## 7. Timer Driving Cadence

Timers are armable in the active agent's session using the `schedule` tool.
- **Cadence:** Run the tick once every 10–15 minutes (using off-round minutes like `*/12` or specific timer durations).
- **Dual Cadence:**
  - Agent A (`claude_code`): Ticks at minutes ending in `3` (e.g. 3, 13, 23...).
  - Agent B (`antigravity`): Ticks at minutes ending in `8` (e.g. 8, 18, 28...).
- **Solo Cadence:**
  - A single timer firing every 10 minutes is sufficient.
