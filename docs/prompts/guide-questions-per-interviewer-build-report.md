# Prep guides: likely questions written for each interviewer

Branch: `fix/guide-questions-per-interviewer`
Base: `origin/main` at `463847b` ("Make the new-interview button a compact light-orange dashboard action.")
Commit: filled in after this file is committed. Not merged. Not deployed.

Worktree: `C:\Repos\aimed-jobseek-guide-questions-fix`

## What shipped

A person guide's likely questions are questions written for that interviewer. The model returns question text, `approvedAnswerId` (or null), and `interviewTypeTag`. When the id matches one of the seeker's approved `INTERVIEW_ANSWER` statements, the guide copies that statement's content exactly. An unknown or null id leaves the answer blank. The seeker edits the copy on the guide turn `cheatSheet:{itemId}`. The original approved statement is not updated.

The person call is one `APPLICATION_SUMMARY_PERSON` call. A list longer than the setting keeps the first slots up to that max and saves. There is no minimum and no count retry.

## Final instruction text

`src/lib/prompt-content/application-summary.ts` lines 32–33. `{max}` is `guide.likelyQuestionsPerPerson`, default 8. The sentence that names `interviewTypeTag` stays on line 32 because the schema still requires the tag; it was not in the remove list.

```
d. likelyQuestions: questions this person is likely to ask. Every likelyQuestions item includes interviewTypeTag, one of: screening, chronological_walk_through, focused_competency, reference_check_prep.
Decide the questions this interviewer is most likely to ask, based on their role, their function, and what they care about. Write each question for this interviewer. Return up to {max}, most likely first. Leave out any question outside this interviewer's function. For a recruiter or talent-acquisition interviewer, include the screen questions they would actually ask (why this company, why you are looking, motivation, compensation, timing, logistics, and high-level qualifying questions on the job's core requirements). For each question, if one of the seeker's approved answers fits it, set approvedAnswerId to that answer's id; an answer fits only when its story shows what this interviewer is asking about. Otherwise set approvedAnswerId to null so the seeker can answer it. Never write or rewrite an answer. Do not return a Harper question id, and do not copy a Harper question word for word.
```

The shell call uses the same system text with the default 8, because it does not pass a live max. It still returns only `overview`. Changing the Super Admin max changes the person call only. The version bump to 19 changes the shell fingerprint once.

## New likely-question schema

Model result, `cheatSheetCoachItemGenerateSchema` in `src/lib/application-summary/contract.ts` lines 29–33:

```
{
  prompt: string,            // trimmed, at least 1 character
  approvedAnswerId: string | null,
  interviewTypeTag: "screening" | "chronological_walk_through" | "focused_competency" | "reference_check_prep"
}
```

`cheatSheetPersonSectionGenerateSchema.likelyQuestions` is that array with `.min(0)` and no max (`contract.ts` line 164). The recover schema is gone.

The stored item (`cheatSheetCoachItemSchema`, lines 39–54) still has `sampleAnswer`, the CAR/STAR parts, and `generalQuestionId` so an existing guide still parses. Resolve writes the copied text into `sampleAnswer` and sets `generalQuestionId` and the parts to null on every new item.

Person user message (`prompt.ts` lines 50–59) adds, only in person mode:

```
approvedAnswers: [{ id, question, content }, ...]
interviewer: { ...existing interviewer context... }
```

`content` is the approved statement text. `question` is the consultant turn that statement answers. General questions are no longer in this message.

## Setting

Key `guide.likelyQuestionsPerPerson`, value `{ "max": 8 }`. Missing, non-object, or out-of-range values (not an integer 1–50) read as 8 (`likely-question-limit.ts` lines 9–27). Super Admin `/platform/harper` shows "Likely questions per person" in the existing Harper drafts form, next to the Harper question counts. Save writes this key. "Use defaults" deletes it.

## Resolve and merge

`resolvePersonLikelyQuestions` (`likely-questions.ts` lines 137–169) keeps the model's question text. A matching id copies that statement's content. Any other id, including null, sets `sampleAnswer` to null. A career walk-through is still dropped when Harper has already asked one. Writer order is kept.

`mergePersonLikelyQuestions` (lines 228–251) keeps seeker-answered or seeker-kept items exactly as stored, even when that already exceeds the max. New questions fill the remaining slots up to the max, skipping near-duplicates of anything already on the list. A version-18 item that only referenced a Harper question and has no guide answer from the seeker is not in the kept set, so it is replaced. An empty merge throws once (`service.ts` lines 1077–1078) and does not call the model again, because a stored section still requires at least one question.

The person block is one call: `service.ts` lines 1115–1130.

## Display

`CheatSheetCoachItems` shows `item.prompt` for every likely question. A copied answer uses the existing sample draft and Edit path (`SampleDraftActions`), which saves through `saveCheatSheetSampleDraft` on `cheatSheet:{itemId}`. A blank answer uses the existing reply box (`answerCheatSheetCoachAction`). A question the seeker has already answered on that guide turn renders that turn under the same prompt. There is no Harper card and no near-duplicate swap.

`displayedPersonQuestions` lists each person question as itself, deduped by its own turn id. It no longer takes General questions or a hidden-turn set.

## Removed pieces

| Piece | Result |
| --- | --- |
| Copying General question text onto `prompt` and clearing the sample (`resolvePersonLikelyQuestions`, old `likely-questions.ts` 332–348) | Removed. Resolve keeps the model prompt. |
| Harper `QuestionList` when `generalQuestionId` is set (`CheatSheetCoachItems` old 154–160 and 185–207) | Removed. The remaining `QuestionList` (`CheatSheetCoachItems.tsx` 168–189) is the guide's own `cheatSheet:{itemId}` turn. |
| `sharedGeneralForCoachItem` and the near-duplicate Harper swap (`general-question-match.ts` old 44–54; `CheatSheetCoachItems` old 162–166 and 208–230) | Removed. |
| "Choose the 4 to 12 questions…" and "Use one of Harper's General questions (by id)…" | Removed from the live instruction. Replaced at `application-summary.ts` line 33. |
| CAR/STAR required, and "never both, never neither", on person likely-question samples | Removed from `validateLikelyQuestionItem`. The function now only requires a prompt and an `interviewTypeTag`. The service does not retry on it. |
| `LIKELY_QUESTION_MIN`, `LIKELY_QUESTION_MAX`, `personLikelyQuestionCountDecision`, generate/recover `.min(4)`/`.max(12)`, the `<= 12` check, and "Return between 4 and 12" | Removed from the person path. |
| Model-written `sampleAnswer`, `answerFramework`, answer parts, and `generalQuestionId` on the generate result | Removed from `cheatSheetCoachItemGenerateSchema`. |
| `cheatSheetPersonSectionGenerateRecoverSchema` | Removed. |
| General questions in the person user message | Removed. |
| Tests that only locked the old instruction, the max of 12, prompt replacement, and prompt version 18 | Rewritten in place to the new rule. Version assertions are `"19"`. |

Kept, with the caller:

- `for (let attempt = 0; attempt < 2` at `service.ts` line 1178. That retries the overview shell (`generateApplicationSummaryShell`), not person likely questions.
- `generalQuestions` on the summary page for General Study Questions. The person body no longer receives them (`summary/page.tsx`, the one-line removal).
- `interviewerQuestionMatchesGeneral` and `matchingGeneralQuestion`. Production caller: `src/lib/consultation/harper-library.ts` line 439, matching an approved library answer to a question. That is the Harper library, not person-guide likely questions.
- `alreadyAnsweredGeneralDuplicateCount` (`general-question-match.ts` line 80). The only caller is `cheat-sheet-batch-2b.test.ts` line 396. On `origin/main` it was already test-only. It does not render a likely question.
- Stored `generalQuestionId` on `cheatSheetCoachItemSchema` line 52, so old rows still parse. New resolved items set it to null.
- `ANSWER_FRAMEWORKS` import in `contract.ts`, used by the stored schema only.
- "Paraphrase is allowed when the facts stay the same" (`application-summary.ts` line 37). It still applies to the other guide fields. Likely-question answers are copied by code, not paraphrased.
- The `harperQuestion` line in `CheatSheetCoachItems.tsx` lines 205–209. New items set `harperQuestion` to null. A seeker-kept older item can still show a stored Harper wording under its own prompt. It is not a General card.

## Stacking check

Searched the worktree, excluding `node_modules` and `.next`.

| Search | Hits | Disposition |
| --- | --- | --- |
| `LIKELY_QUESTION_MIN` | none in source | Removed |
| `LIKELY_QUESTION_MAX` | none in source | Removed |
| `4 to 12` | `docs/prompts/guide-questions-by-person-prompt.md` line 22; the saved build prompt | Archived task prompts, not the live instruction |
| `between 4 and 12` | the saved build prompt only | The retry string was removed from `refresh-likely-questions.test.ts` |
| `Use one of Harper's General questions` | the archived prompt above; `likely-questions-from-general.test.ts` line 622 asserts the live prompt does not contain it; the saved build prompt | Live instruction does not contain it |
| `sharedGeneralForCoachItem` | `docs/prompts/cheat-sheet-likely-questions-prompt.md` line 19; the saved build prompt | Archived. No source function |
| `cheat-sheet-referenced-general-question` | tests assert the node is absent (`likely-questions-from-general.test.ts` 271, 495; `cheat-sheet-batch-2b.test.ts` 387) | No renderer |
| `cheat-sheet-shared-general-question` | tests assert the node is absent (same files, lines 496, 502, 386) | No renderer |
| `prompt = match.text` or `prompt: match.text` | none | The General text is not assigned onto a likely question |

## Checks

Chosen because each one proves a required rule, and nothing else.

| Check | Why | Result |
| --- | --- | --- |
| `guide-questions-per-interviewer.test.ts` | Approved text copied word for word by id; unknown and null ids are blank; a list over the max is trimmed with no retry; a seeker-kept question survives unchanged; the setting defaults to 8 | Passed |
| `likely-questions-from-general.test.ts` | The live instruction is the new paragraph; the person message sends approved answers; the question text renders, with no Harper card | Passed (once after the first run; the first failure was test prompts that near-duplicated each other, and an assertion aimed at the shell loop) |
| `harper-batch-d4.test.ts` | Version 19; resolve copies or blanks; the person block is one call | Passed on the re-run |
| `cheat-sheet-batch-2b.test.ts` | A sample answer shows the Edit path, not a shared or referenced Harper card | Passed on the re-run |
| `refresh-likely-questions.test.ts` | Merge keeps seeker questions and fills only the remaining slots | Passed |
| `npx tsc --noEmit` | Types, including the hash input that no longer takes `generalQuestions` | Passed |
| `npx eslint` on the edited files | New warnings from unused test helpers were removed. One pre-existing unused `_input` warning remains in `refresh-likely-questions.test.ts` line 8 | 0 errors |
| `npx next build` | Production compile and typecheck | Passed after `prisma generate` |

The first `next build` panicked because this worktree's `node_modules` was a junction through another worktree, which Turbopack rejects. A real `npm ci` plus `prisma generate` in this worktree, then `npx next build`, compiled successfully. That junction was an environment limit, not a code failure. Webpack was tried once against the junction and failed resolving `node:crypto` through the nested link; it was not re-run after the real install because the default Turbopack build passed.

No full suite. No test file failed twice. The local database was not required.

## Overlap

The shared system prompt is used by the shell and by every person section. The new paragraph and version 19 change the shell fingerprint once at deploy. The shell still writes only the overview. It does not receive approved answers, and it does not pass the live max, so an admin change of the max does not regenerate the shell.

Harper's page, General Study Questions, other guide sections, and the other summary calls are unchanged except for that shared prompt text and version.

`displayedPersonQuestions` no longer hides a General question that a likely question used to stand in for. A General question and a person question can both appear when their text is similar. That is the requested display: each likely question shows its own text, and General Study stays a separate list.

## Input-token change

Approved answers are added only to the person user message, once per interviewer, on the one person call.

Each item is `{ id, question, content }` plus JSON keys. A rough English estimate is about 4 characters per token:

- id and keys: about 10 tokens
- the question the statement answers: about 20–55 tokens
- the approved content: about 130–520 tokens for a short paragraph through a few paragraphs

A mid-size approved answer is about 250 input tokens. N answers add about 250N tokens.

The person message no longer includes Harper's General questions. One general question was about 40–80 tokens. G of them remove about 60G tokens.

Net per person guide is about `250N - 60G`. Example, not a production count: 10 approved answers and 12 general questions is about +1,800 input tokens. There is no production row count in this report. The system paragraph is about the same length as the sentence it replaced.

## Files

| File | Change |
| --- | --- |
| `src/lib/prompt-content/application-summary.ts` | New item d; system text takes the max |
| `src/lib/application-summary/contract.ts` | Version 19; generate schema is prompt, approvedAnswerId, interviewTypeTag; no 4–12 cap; recover schema removed |
| `src/lib/application-summary/likely-questions.ts` | Resolve copies by id; merge keeps seeker items and fills to the max |
| `src/lib/application-summary/likely-question-limit.ts` | New. Setting reader, default 8 |
| `src/lib/application-summary/approved-answers.ts` | New. Loads approved statements for the person message |
| `src/lib/application-summary/prompt.ts` | Person message sends approved answers and the interviewer; system text uses the live max |
| `src/lib/application-summary/people.ts` | Section hash uses approved answers and the max |
| `src/lib/application-summary/ai.ts` | One schema parse; no recover path |
| `src/lib/application-summary/service.ts` | One person call, then resolve, merge, save |
| `src/lib/application-summary/coach.ts` | Stable ids hash the question text |
| `src/lib/consultation/general-question-match.ts` | Near-duplicate swap and shared-turn hiding removed |
| `src/components/CheatSheetCoachItems.tsx` | Own prompt, sample Edit, or reply box |
| `src/components/CheatSheetPersonBody.tsx` | No General-question substitution |
| `src/components/HarperPersonView.tsx` | Stops passing General questions into the person body |
| `src/app/(app)/campaigns/[id]/summary/page.tsx` | Person body no longer receives General questions |
| `src/app/platform/harper/page.tsx` | Loads the max |
| `src/components/platform/HarperDraftSettingsForm.tsx` | Editable max |
| `src/app/actions/platform-settings.ts` | Saves and clears the key |
| Tests listed above | New rule |
| `src/lib/interview/new-interview.test.ts` | Drops `generalQuestions` from the section hash fixture |

Diff against `463847b` before this report: 25 files, +437 / −883, plus the new files `approved-answers.ts`, `likely-question-limit.ts`, `guide-questions-per-interviewer.test.ts`, the saved build prompt, and this report.
