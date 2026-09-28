# REPORT — Persona build reliability follow-ups (ITEMS 1–4)

Repo: `C:/Repos/aimed-jobseek` · remote: `https://github.com/emaron01/aimed-jobseek.git`

## 1. ITEM 1 result

**PASS.** Fixture `csc-executive-leadership-fixture.ts` maps the CSC Executive Leadership persona (Senior Director of Sales - North America) into `HiringTeamDraftFields` (overview, impact, pressures, needs, concerns, interviewStage, evaluates, talkingPoints, communication) plus `cscExecutiveLeadershipWhyIdentified` (identification evidence; not assessed by `assessHiringTeamDraft`).

`assessHiringTeamDraft` returned `{ ok: true }`. Test: `accepts the complete CSC Executive Leadership persona fixture`.

## 2. ITEM 2: message, detection, changes

**Seeker-facing message** (from `queueHiringTeamBuild` → `TenantError`):

> Persona synthesis is not available yet. Try again after setup is complete.

**Where it renders:** `buildApplicationRoleAction` / `rebuildApplicationRoleAction` / `buildAllDirectRolesAction` catch via `fail()` → `HiringTeamActionResult.message` → `ApplicationActionForm` shows `state.message`.

**STOP for wording:** message contains system language **`synthesis`**. Per instructions, no new wording written. Product owner must supply replacement text.

**Startup detection (was missing; now added):**
- `assertPersonaAiConfigured()` in `src/lib/ai/config.ts`
- Web production boot: `src/instrumentation.ts` `register()`
- Worker: `scripts/research-worker.ts` logs `{ event: "persona_ai_configuration_missing", severity: "operational" }` when missing; in `NODE_ENV===production` also calls `assertPersonaAiConfigured()` (throws)

## 3. ITEM 3 result

**Confirmed correct; no code fix required.** `updateApplicationHiringTeamRole` updates only `where: { id: persona.id }`.

Postgres test `editing one built role marks only that role stale`: edits one built role → that role gets `staleAt`; sibling built role stays `staleAt: null`.

## 4. ITEM 4 before / after / restore

| | Assertion on `service.ts` |
|--|--|
| **Before** | `expect(jobs).toContain("isTimeoutMessage")` |
| **After (reliability implement)** | `expect(jobs).toContain("isRetryableProviderMessage")` |
| **Why changed** | `failApplicationJob` switched to broader `isRetryableProviderMessage` for temp provider failures; test was updated to match the new symbol |
| **Restored** | **Yes** — original `isTimeoutMessage` assertion restored |
| **Code fix** | `failApplicationJob` now uses `(isTimeoutMessage(...) \|\| isRetryableProviderMessage(...))` so the timeout contract remains explicit and broader retries remain |

Did not alter identity-queue semantics; restore keeps the original timeout-retry contract visible in `service.ts`.

## 5. Files changed

**Added**
- `docs/prompts/harper-persona-build-reliability-followups.md`
- `docs/prompts/harper-persona-build-reliability-followups-report.md`
- `src/lib/hiring-team/csc-executive-leadership-fixture.ts`

**Modified**
- `src/lib/ai/config.ts` — `assertPersonaAiConfigured`
- `src/instrumentation.ts` — call assert on web boot
- `scripts/research-worker.ts` — operational log + production assert
- `src/lib/application-jobs/service.ts` — restore `isTimeoutMessage` in retry check
- `src/lib/application/identity-queue.test.ts` — restore original assertion
- `src/lib/ai/config.test.ts` — persona startup assert test
- `src/lib/hiring-team/build-reliability.test.ts` — ITEM 1 + ITEM 2 tests
- `src/lib/hiring-team/hiring-team.test.ts` — ITEM 3 postgres test

## 6. Tests + suite

- ITEM 1: complete CSC persona passes assess
- ITEM 2: startup wiring; current seeker message recorded (contains `synthesis` — STOP)
- ITEM 3: edit one role → only that role stale
- ITEM 4: identity-queue timeout assertion restored

**Full suite:** `npx vitest run` → **245 files, 1815 passed**. Real-Postgres hiring-team describe ran (including new stale-scope test).

## 7. Scope confirmation

Only ITEMS 1–4. No prompt text, quality-check rules, chip text, serialization, Phase 1 gate, schema, or unrelated features changed.
