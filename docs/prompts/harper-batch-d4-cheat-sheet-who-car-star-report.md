# Harper Batch D4 — Cheat Sheet WHO tags + CAR/STAR parts

**Branch:** `checkpoint/harper-prep-hub`  
**Commit:** _(filled after commit)_  
**Remote:** `https://github.com/emaron01/aimed-jobseek.git`  
**Base:** merged from `origin/main` at `1885536` (already up to date)

## 1. STEP 1 — Interview guide

| Location | Role |
| --- | --- |
| `src/lib/interview/ai.ts` — `generateInterviewGuideWithModel` | Model call |
| `src/lib/interview/guide.ts` ~600–632 — `requestInterviewGuide` writes `contentJson` | Persist guide |
| `src/lib/application-jobs/process.ts` ~233–238 — `case "INTERVIEW_GUIDE"` | Worker trigger |
| `src/app/actions/interview.ts` ~290–323 — `generateInterviewGuideAction` enqueues `INTERVIEW_GUIDE` | Action enqueue (no component imports it) |
| `src/lib/interview/guide.ts` ~721 — `getInterviewGuideView` | View helper **unused by any page/component** |

**Rendered after Batches B1–B5:** nowhere. No component under `src/components/` or page under `src/app/` imports `getInterviewGuideView`, `parseGuideContent`, or `generateInterviewGuideAction`.

**Guide changed?** **No.** Stopped on the guide only. Triggers that may still pay for unseen output: worker `INTERVIEW_GUIDE` jobs and the unused `generateInterviewGuideAction` enqueue path — for PO decision.

## 2. Schema, prompt, version

**Schema** (`contract.ts`):
- `cheatSheetCoachItemGenerateSchema`: required `interviewTypeTag`; flat nullable `answerFramework` + parts (`challenge`/`situation`/`task`/`action`/`result`); `sampleAnswer` / `harperQuestion` nullable.
- Display `cheatSheetCoachItemSchema`: same fields optional so legacy guidance without tags/parts still parses.
- Person generate uses generate coach items for `likelyQuestions`.

**Prompt** (`application-summary.ts` likely-questions bullet): appended exact PO text about `interviewTypeTag` and CAR/STAR parts. No other wording changed.

**Version:** `APPLICATION_SUMMARY_PROMPT_VERSION` **12 → 13**. Triggers on next Cheat Sheet shell/person write of `promptVersion` / person `inputHash` regen when inputs change; does **not** regenerate on page view. Person-section bound remains **2 attempts** (`attempt < 2` in `service.ts`).

## 3. Validation, compose, storage, order, dedupe

Module `src/lib/application-summary/likely-questions.ts`:
- Tag override via D2 `resolveInterviewTypeTag` / `looksLikeCareerWalkThrough`
- Parts / lenient result / label checks via D3 helpers
- `composeSampleAnswerFromParts` → composed `sampleAnswer`; parts kept on the item in guidance JSON
- `sortLikelyQuestionsByWhoTag` — WHO order
- `harperAlreadyAskedCareerWalkThrough` + filter in `normalizePersonSectionLikelyQuestions`

Wired in `generateApplicationSummary` person path (`service.ts`): validation → `qualityFeedback` → bounded regen → normalize → store.

## 4. No seeker-facing tags/labels

Cheat Sheet / Harper components do not render `interviewTypeTag`, `answerFramework`, or part labels. Rendering enqueues no jobs and makes no paid calls.

## 5. Files changed

- `src/lib/application-summary/contract.ts`
- `src/lib/prompt-content/application-summary.ts`
- `src/lib/application-summary/likely-questions.ts` **(added)**
- `src/lib/application-summary/service.ts`
- `src/lib/application-summary/coach.ts`
- `src/lib/application-summary/harper-batch-d4.test.ts` **(added)**
- Version/fixture: `cheat-sheet.test.ts`, `harper-batch-d1.test.ts`, `application-summary.test.ts`
- `docs/prompts/harper-batch-d4-cheat-sheet-who-car-star.md`, `docs/prompts/harper-batch-d4-cheat-sheet-who-car-star-report.md`

## 6. Tests

**Added:** `harper-batch-d4.test.ts` — STEP 1 audit; schema/quality; qualitative + label cases; compose/store; harperQuestion; WHO order; walk-through dedupe; legacy display; no UI tags; free render.

**Changed:** prompt version **13**; person-section mock returns CAR parts + tag so generation quality loop accepts fixtures (assertions not weakened).

| Check | Result |
| --- | --- |
| `npm test` | **1946 passed**, 261 files |
| `npm run build` | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | 0 errors; 2 pre-existing script warnings |

## 7. Commit / branch

- Commit: _(filled after commit)_
- Pushed: `checkpoint/harper-prep-hub` (not main)

## 8. Safety

No destructive git commands. D4 Cheat Sheet only; interview guide untouched; no D2/D3/D5–D7 changes.
