# Harper coach prompt cap from config — report

Repository: `aimed-jobseek` (`https://github.com/emaron01/aimed-jobseek.git`). No other repos touched.

## 1. Before and after (approved lines only)

**Before**

- `Across the whole application, including questions already asked, there are never more than 10.`
- `When every important gap is closed or confirmed and every question is answered, or 10 questions have been asked, set questions to [] and write closingNote as coaching that they can prepare from what you have covered. If any gap is still open, closingNote is null.`

**After** (cap from `consultationConfig.applicationQuestionLimit` at build time; currently 25)

- `Across the whole application, including questions already asked, there are never more than ${questionCap}.`
- `When every important gap is closed or confirmed and every question is answered, or ${questionCap} questions have been asked, set questions to [] and write closingNote as coaching that they can prepare from what you have covered. If any gap is still open, closingNote is null.`

Rendered coach instructions use `buildConsultationCoachSystemInstructions()` so the exported `CONSULTATION_COACH_SYSTEM_INSTRUCTIONS` contains the live config value. No duplicated literal cap in the prompt text.

## 2. Prompt version handling and what it triggers

- Constant: `CONSULTATION_PROMPT_VERSION` in `src/lib/consultation/contract.ts`.
- Convention: bump when consultation prompt text changes (repo prompts consistently require a bump).
- This change: `"26"` → `"27"`.

**What a version change does**

- New coach / extract / polish payloads include `Prompt version: 27` via `src/lib/consultation/prompt.ts`.
- New or replanned sessions store `promptVersion: CONSULTATION_PROMPT_VERSION` on the session when a seeker-triggered plan runs.
- `briefingNeedsStandingRegen` is true when a stored session’s `promptVersion` differs from the current constant — but **nothing on page view calls it**.
- `ConsultationSection` / consultation page do **not** call `shouldEnqueueConsultationStandingRegen`, `planAndStoreRound`, or enqueue consultation jobs on render.

**Automatic regeneration on page view:** none. Existing applications keep their stored plan until a seeker action replans. Bump is safe; no STOP.

## 3. Files changed (this task)

| File | Change |
|------|--------|
| `docs/prompts/harper-coach-prompt-cap-from-config.md` | Saved input prompt |
| `docs/prompts/harper-coach-prompt-cap-from-config-report.md` | This report |
| `src/lib/prompt-content/consultation.ts` | Builder interpolates `applicationQuestionLimit` on the two lines |
| `src/lib/prompt-content/index.ts` | Export `buildConsultationCoachSystemInstructions` |
| `src/lib/consultation/contract.ts` | `CONSULTATION_PROMPT_VERSION` → `"27"` |
| `src/lib/consultation/consultation.test.ts` | Cap-from-config + alternate-cap assertions; version `"27"` |
| `src/lib/consultation/harper-context-finish.test.ts` | Version `"27"` |
| `src/lib/consultation/harper-batch-a-ignore.test.ts` | Replaced Batch A “hardcoded 10 for PO” sentinel with config-interpolated assertions |
| `src/lib/application/no-ai-on-view.test.ts` | Assert page/section never call `planAndStoreRound` / standing regen enqueue |

Nothing else in scope was modified for this prompt (no schema, migrations, ignore behavior, or cap value change).

## 4. Tests and suite result

**Added / updated**

- Coach prompt contains `consultationConfig.applicationQuestionLimit` in both lines; no question-limit hardcoded `10`.
- `buildConsultationCoachSystemInstructions(7)` changes those numbers to `7`.
- Page view does not trigger a consultation plan (`planAndStoreRound` absent from consultation page/section; existing no-AI-on-view coverage kept).
- Batch A ignore test updated because the prior “leave hardcoded 10 for PO approval” assertion is obsolete after this PO-approved change.

**Full suite**

```
npm run db:test:up   # aimed-jobseek TEST Postgres on 127.0.0.1:5435
npm test             # vitest run

Test Files  248 passed (248)
     Tests  1844 passed (1844)
```

Real-Postgres consultation session tests ran (DB-backed session IDs in `consultation.test.ts`). No new failures. No existing tests weakened solely to pass.

## 5. Scope confirmation

Only the two approved coach-prompt lines now read the shared `applicationQuestionLimit`; prompt version bumped per convention; ignore behavior and the numeric cap setting itself were not changed; no page-view regen introduced.
