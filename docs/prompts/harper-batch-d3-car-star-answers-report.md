# Harper Batch D3 — CAR/STAR polish answer parts

**Branch:** `checkpoint/harper-prep-hub`  
**Commit:** `a84af8e19588064e735bab6762ffabc7edc28b93` (`a84af8e`)  
**Remote:** `https://github.com/emaron01/aimed-jobseek.git`  
**Base:** merged from `origin/main` (already up to date at `f54001c`)

## 1. Schema, prompt, version

**Schema** (`src/lib/consultation/contract.ts`): flat OpenAI-strict `consultationPolishSchema` with nullable `answerFramework` (`CAR` | `STAR`), `interviewAnswer`, part fields (`challenge`, `situation`, `task`, `action`, `result`), plus `resumeBullet` and `strengtheningNote`. Non-exception answers use framework + parts; whyThisCompany / confirmedGap use a single `interviewAnswer`. Combinations are enforced in the polish quality loop (not by Zod union, which OpenAI strict rejects at the root).

**Prompt** (`src/lib/prompt-content/consultation.ts`):

*Before:*
```text
When confirmedGap is false and whyThisCompany is false: turn the person's answers into two statements.
- Interview answer: natural first-person speech, the way a confident professional says it aloud. Follow Situation, Task, Action, Result without naming that structure. Only as long as the facts support, within interviewAnswerMaxWords. Never repeat a fact or number without adding new information.
- Resume bullet: one line, leading with the action and ending with the result or metric.
```

*After (interview-answer instruction replaced; resume bullet line unchanged):*
```text
When confirmedGap is false and whyThisCompany is false: turn the person's answers into interview answer parts and one resume bullet.
- Interview answer parts: choose answerFramework "CAR" (challenge, action, result) by default, or "STAR" (situation, task, action, result) only when the answer needs distinct setup and responsibility to make sense. Return each part as its own field, in natural first-person speech the way a confident professional says it aloud, so the parts read as one answer when joined in order. The result states what changed because of the person's action; a number is welcome when the facts include one but is never required. Keep the whole answer only as long as the facts support, within interviewAnswerMaxWords. Never repeat a fact or number without adding new information. Never name the framework or label a part in any field.
- Resume bullet: one line, leading with the action and ending with the result or metric.
```

**Version:** `CONSULTATION_PROMPT_VERSION` **29 → 30**. Triggers on the next seeker-started Harper plan / polish path that writes `session.promptVersion` / statement `promptVersion`; does **not** regenerate on page view. `qualityRegenerationAttempts` remains **2**.

## 2. Validation (incl. lenient result)

`validatePolishPartsQuality` in `src/lib/consultation/polish-parts.ts`, called from `polishAnswerWithQuality` in `service.ts` (~653).

- Exceptions: require non-empty `interviewAnswer`, no `answerFramework`/parts.
- Non-exception: require `answerFramework` and every part for that framework non-empty.
- **Lenient result** (`resultStatesOutcome`, ~79–85): trimmed non-empty and at least four words (states what changed/happened). **Never requires a digit or metric.**
- No field may contain framework names (`CAR` / `STAR`) or part labels (`Challenge:`, `Situation:`, etc.) — `containsFrameworkOrPartLabel` (~88–101).
- Composed answer must stay within `interviewAnswerMaxWords`.
- Failures feed `qualityFeedback` and use the existing bounded regeneration; after the last attempt → `ok: false` → `finishItemNeedsMoreDetail` (needs-more-detail copy; APPROVED untouched).

## 3. Compose and storage

- `composeInterviewAnswerFromParts` (~28–39) joins parts in framework order with sentence boundaries and no labels.
- `normalizePolishAnswer` produces `interviewAnswer` (composed or exception string) + `answerPartsGrounding`.
- Stored in `ConsultationStatement.content` (composed); parts + `answerFramework` in `groundingJson` via `interviewAnswerGroundingJson` (additive object; legacy `[]` left alone). Resume bullets unchanged. Approve no longer wipes `groundingJson`.

## 4. No seeker-facing framework/labels

Confirmed Harper and Cheat Sheet components do not render `answerFramework`, part labels, or method names. Layout/display paths enqueue no jobs and make no paid calls. Batch C raw-reply / meta-commentary checks apply to the composed answer.

## 5. Files changed

- `src/lib/consultation/contract.ts`
- `src/lib/prompt-content/consultation.ts`
- `src/lib/consultation/polish-parts.ts` **(added)**
- `src/lib/consultation/service.ts`
- `src/lib/consultation/harper-batch-d3.test.ts` **(added)**
- Version / fixture updates: `consultation.test.ts`, `harper-batch-d2.test.ts`, `harper-batch-d1.test.ts`, `harper-context-finish.test.ts`
- `docs/prompts/harper-batch-d3-car-star-answers.md`, `docs/prompts/harper-batch-d3-car-star-answers-report.md`

## 6. Tests

**Added:** `harper-batch-d3.test.ts` — missing/empty part → regen; qualitative results (nursing/hospitality/new-grad); label/framework reject; compose + grounding; why/gap exceptions; needs-more-detail + APPROVED safety; no UI labels; no render enqueue/paid call.

**Changed existing tests:** prompt version **30**; polish fixtures return flat CAR/composed shapes so they match the new schema and quality loop (not weakened assertions).

| Check | Result |
| --- | --- |
| `npm test` | **1935 passed**, 260 files |
| `npm run build` | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | 0 errors; 2 pre-existing script warnings |

## 7. Commit / branch

- Commit: _(filled after commit)_
- Pushed: `checkpoint/harper-prep-hub` (not main)

## 8. Safety

No destructive git commands. Scope limited to Batch D3 CAR/STAR polish parts, validation, compose, and grounding storage. No D4–D7, resume-bullet behavior change, extract, or D2 tag changes.
