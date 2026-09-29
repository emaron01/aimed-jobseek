# Harper Batch D2 — WHO interview-type tags

**Branch:** `checkpoint/harper-prep-hub`  
**Commit:** _(filled after commit)_  
**Remote:** `https://github.com/emaron01/aimed-jobseek.git`  
**Base:** merged from `origin/main` at `f54001c` (already up to date)

## 1. Schema, prompt, version

**Schema** (`src/lib/consultation/contract.ts`): required `interviewTypeTag` on `consultationPlanSchema.questions[]` with enum `screening | chronological_walk_through | focused_competency | reference_check_prep`.

**Prompt** (`src/lib/prompt-content/consultation.ts` Questions block):

*Before:* first Questions bullet was “Ask one question per remaining important gap…”

*After — added as first Questions bullet:*

```text
- Every question includes interviewTypeTag, one of: screening, chronological_walk_through, focused_competency, reference_check_prep. Use chronological_walk_through only for the career walk-through question; screening for broad fit and motivation questions such as why this company; focused_competency for a specific requirement or gap; reference_check_prep for what a former manager or colleague would confirm.
```

**Version:** `CONSULTATION_PROMPT_VERSION` **28 → 29**. Triggers on the next seeker-started Harper plan (session `promptVersion`); does **not** regenerate on page view. Missing/unknown tags fail Zod parse → `planConsultationWithModel` returns `ok: false` → `planAndStoreRound` continues within `qualityRegenerationAttempts`.

## 2. Deterministic overrides

`resolveInterviewTypeTag` in `src/lib/consultation/questions.ts` (**~37–51**), applied when building planned questions in `questionForGap` and when appending chronology in `planQuestionRound`:

- `targetKey === chronology` or `looksLikeCareerWalkThrough(text)` → `chronological_walk_through`
- `targetKey === why-this-company` → `screening`
- else → model tag

## 3. Storage and ordering

- Stored on consultant turns in `questionContextJson.interviewTypeTag` via `planAndStoreRound` → `addTurn` (`service.ts`).
- Older turns without a tag: ordering treats them as `focused_competency` (no data repair).
- `sortQuestionsOpenFirst` / `sortQuestionsByWhoTag` in `harper-layout.ts`: open first, then WHO order within each group; same for interviewer sections and standing topics.

## 4. No seeker-facing tags

Confirmed Harper/Cheat Sheet components and consultation/summary pages do not contain `interviewTypeTag`, WHO tag values, or method names. Layout/display paths enqueue no jobs and make no paid calls.

## 5. Files changed

- `src/lib/consultation/contract.ts`
- `src/lib/prompt-content/consultation.ts`
- `src/lib/consultation/questions.ts`
- `src/lib/consultation/service.ts`
- `src/lib/consultation/qa-view.ts`
- `src/lib/consultation/harper-layout.ts`
- `src/lib/consultation/harper-display-qa.ts`
- `src/lib/consultation/harper-batch-d2.test.ts` **(added)**
- Version / fixture updates: `consultation.test.ts`, `harper-context-finish.test.ts`, `harper-batch-d1.test.ts`, `harper-batch-c.test.ts`, `harper-batch-a-ignore.test.ts`, `standing.test.ts`, `harper-workspace.test.ts`, `content-gates.test.ts`, `role-dates.test.ts`
- `docs/prompts/harper-batch-d2-who-tags.md`, `docs/prompts/harper-batch-d2-who-tags-report.md`

## 6. Tests

**Added:** `harper-batch-d2.test.ts` — schema reject; bounded regen loop; chronology/why overrides; `questionContextJson` store; WHO ordering + untagged → focused_competency; no UI tags; no render enqueue/paid call.

**Changed existing tests:** prompt version **29**; model-question fixtures add `interviewTypeTag` so they type-check against the new plan shape (not weakened assertions).

| Check | Result |
| --- | --- |
| `npm test` | **1927 passed**, 259 files |
| `npm run build` | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | 0 errors; 2 pre-existing script warnings |

## 7. Commit / branch

- Commit: _(filled after commit)_
- Pushed: `checkpoint/harper-prep-hub` (not main)

## 8. Safety

No destructive git commands. Scope limited to Batch D2 WHO tags on Harper coach planning/display ordering. No Cheat Sheet/guide generators, answer parts, career stage, role-expertise, or learnings changes.
