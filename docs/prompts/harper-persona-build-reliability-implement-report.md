# REPORT — Personas / Interviewers build reliability (v2 + PO decisions)

Repo: `C:/Repos/aimed-jobseek` · remote: `https://github.com/emaron01/aimed-jobseek.git`

## 1. STEP 0 results

Ran `npx tsx scripts/step0-assess-hiring-team-drafts.ts` against local DB + fixtures.

| Metric | Count |
|--------|------:|
| Checked | 3 |
| Rejected | 1 |
| Rejected complete-looking (real evidence) | 0 |
| Rejected genuinely deficient | 1 |
| Accepted | 2 |

Rejection: fixture `incomplete overview-only` (Customer Success) — missing Impact, Pressures, Needs (≥2), Concerns, Talking points, How to communicate, Interview stage. Classification: fixable / deficient shape.

**CONTINUE** — no complete real narrative rejected. Quality check wired in.

## 2. Decisions → implementation

| # | Decision | Where |
|---|----------|--------|
| 1 | One waiting-for-details state; no narrative saved on incomplete | `ai.ts` synthesize → `AWAITING_DETAILS`; `build.ts` `draftsFor` / `personaFields` / `profilePayload` (`awaitingSeekerInput`); `setupStatus` `FAILED` for Retry button |
| 2 | Incomplete receipts: `INSUFFICIENT_INFORMATION` forever; `TEMPORARY_EXHAUSTED` 1h | `synthesize-outcome.ts` `record`/`read`; cooldown `HIRING_TEAM_TEMPORARY_COOLDOWN_MS`; `hiringTeamSynthesizeUnchanged` + actions skip |
| 3 | Assess + one regen with rejection reasons (new fingerprint) | `ai.ts` `synthesizeHiringTeamRole` loop `attempt < 2`, `rejection = quality.reasons`, `synthesisRejection` in userContext |
| 4 | Temp failures retry in worker before awaiting | `RetryableHiringTeamProviderError` + `isRetryableProviderMessage` in `ai.ts` / `types.ts` / `service.ts` `failApplicationJob`; terminal → `markHiringTeamBuildTemporaryExhausted` in `process.ts` |
| 5 | Config precheck, no system language to seeker | `queueHiringTeamBuild` throws “Persona synthesis is not available yet…”; Live hides HT job errors |
| 6 | Built = narrative object only | `isHiringTeamPersonaBuilt` in `build.ts`; `merge-existing.ts`; `generation/context.ts`; tracker/step-progress via built helper |
| 7 | Approve only with narrative | `approveApplicationHiringTeamRole`; Approve button gated on `roleBuilt` |
| 8 | modelNote stored, never rendered | removed seeker render; still in `readNarrative` / `profilePayload` |
| 9 | Add form above Direct, label “Add Interviewer Title / Persona” | `ApplicationWorkspace.tsx` HiringTeamSection |
| 10 | Status chips | `hiringTeamStatusChip` + `hiringTeamConfig.status` |

## 3. Status → chip mapping

| Role state | Chip |
|------------|------|
| Identified (not built) | _(none)_ |
| Starting… / Generating (`SYNTHESIZING` or pending/in-progress BUILD job) | **Building…** + spinner |
| Ready (built, not stale, not approved) | _(none)_ |
| Stale | **Details changed: Regenerate to update** |
| Waiting for details / Failed | **Add more details to build this persona** |
| Approved (with narrative) | **Approved** |

## 4. Files changed (this scope)

**Added**
- `docs/prompts/harper-persona-build-reliability-implement.md`
- `docs/prompts/harper-persona-build-reliability-implement-report.md`
- `scripts/step0-assess-hiring-team-drafts.ts`
- `src/lib/hiring-team/synthesize-outcome.ts`
- `src/lib/hiring-team/build-reliability.test.ts`

**Modified**
- `src/lib/hiring-team/ai.ts`
- `src/lib/hiring-team/build.ts`
- `src/lib/hiring-team/hiring-team.test.ts`
- `src/lib/hiring-team/merge-existing.ts`
- `src/lib/product-config/hiring-team.ts`
- `src/components/ApplicationWorkspace.tsx`
- `src/components/ApplicationWorkspaceLive.tsx`
- `src/app/actions/hiring-team.ts`
- `src/lib/application-jobs/process.ts`
- `src/lib/application-jobs/service.ts`
- `src/lib/application-jobs/types.ts`
- `src/lib/application/identity-queue.test.ts`
- `src/lib/ai/paid-call-guard.phase1.test.ts`
- `src/lib/generation/context.ts`

(`paid-inputs.ts` remains Phase 1 fingerprint helpers; used by synthesize incomplete + unchanged skip.)

## 5. Tests

**Added:** `build-reliability.test.ts` — modelNote, form placement, chips, built without narrative, incomplete receipts/cooldowns, assess wiring, config gate, no auto-build, Live hide, temp retry path, edit clears awaiting, approve requires narrative.

**Changed existing**
- `hiring-team.test.ts` — quality regen (2 calls → good draft); awaiting after double fail; approve without narrative rejects; mock incomplete synthesize helpers.
- `paid-call-guard.phase1.test.ts` — draft `needsFromHire` length ≥2 so assess passes (was 1 → false `synthesizeSkipped`).
- `identity-queue.test.ts` — expects `isRetryableProviderMessage` (replaces timeout-only check) because temp retries widened.

**Suite:** `npx vitest run` → **245 files, 1810 passed**. Real-Postgres describes ran (`hiring team per application`, `paid-call gate Phase 1 with database`, `application job serialize same-key (database)` — not skipped).

## 6. Scope confirmation

- No persona/Harper **prompt text** changes (reverted an unrelated `persona-synthesis.ts` edit from the working tree).
- No schema / migrations / data repair.
- Serialization policy unchanged (worker still uses same-key rules).
- `employerIcpFit` gating untouched.
- Phase 1 gate: only `isPersonaDraftResultUsable` so incomplete sentinels are not treated as usable drafts.

## 7. Deviations

1. Incomplete builds persist `setupStatus: FAILED` (with `awaitingSeekerInput`) so the existing **Retry** button path remains; chip copy is awaiting-details, not “Failed”.
2. Edit of a **built** role sets `staleAt` so the Stale chip appears; unbuilt edit clears `awaitingSeekerInput` so Generate/Retry can run with the new fingerprint. Edit does **not** auto-enqueue build (Add form behavior unchanged; seeker clicks Generate/Retry).
3. Non-retryable model `ok: false` inside synthesize gets one loop retry before insufficient sentinel (same 2-attempt loop as quality regen).
