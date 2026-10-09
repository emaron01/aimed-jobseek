[BUILD, REPORT] Prep guides: likely questions written for each interviewer

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Production-grade code that fixes the root cause found in docs/prompts/guide-questions-per-interviewer-report.md. No temporary fixes, no fallbacks that restore the old behavior.

NO STACKING, NO CONFLICTS (mandatory)
This change REPLACES the current person-guide likely-question rules. Do not add new code beside old code, do not add flags or branches that keep the old path alive, and do not leave dead code. Reuse the existing APPLICATION_SUMMARY_PERSON call, receipt, likelyQuestions array, reply path (answerCheatSheetCoachItem), and PlatformSetting helpers.

Remove each of these (or rewrite it in place to the new rule). Do not keep any of them alongside the new code:
- resolvePersonLikelyQuestions, likely-questions.ts lines 332–348: copying the General question text into prompt and clearing the sample.
- CheatSheetCoachItems.tsx lines 154–160 and 185–207: rendering the Harper QuestionList when generalQuestionId is set.
- general-question-match.ts lines 44–54 (sharedGeneralForCoachItem) and CheatSheetCoachItems.tsx lines 162–166 and 208–230: the near-duplicate swap to a Harper card for likely questions.
- application-summary.ts line 30: "Choose the 4 to 12 questions…" and "Use one of Harper's General questions (by id)…".
- application-summary.ts line 29 and validateLikelyQuestionItem (likely-questions.ts lines 166–180): CAR/STAR required on person likely-question samples, and the "never both, never neither" rule.
- LIKELY_QUESTION_MIN, LIKELY_QUESTION_MAX, personLikelyQuestionCountDecision's retry and accept-short logic (lines 113–135), the person generate and recover schemas' .min(4)/.max(12), the <= 12 check at service.ts line 1143, and the "Return between 4 and 12" retry feedback.
- The model-written sampleAnswer, answerFramework, answer parts, and generalQuestionId on the person likely-question result.
- Tests that only lock the old behavior: likely-questions-from-general.test.ts (instruction string, max 12, prompt replaced by General text, stored prompt must not show) and the version "18" assertion in harper-batch-d4.test.ts.

If a removed piece is still used by something outside person-guide likely questions, do not remove it there. Report the caller and file/line instead.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/guide-questions-per-interviewer. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree.

SURGICAL RULE
Change only the person-guide likely questions as described below. The Harper page, General Study Questions, other guide sections, and the other summary calls stay exactly as they are. Do not deploy.

CHANGE
1. Instruction. In src/lib/prompt-content/application-summary.ts item d, replace the removed sentences above with exactly this text, where {max} is the setting in step 6:
"Decide the questions this interviewer is most likely to ask, based on their role, their function, and what they care about. Write each question for this interviewer. Return up to {max}, most likely first. Leave out any question outside this interviewer's function. For a recruiter or talent-acquisition interviewer, include the screen questions they would actually ask (why this company, why you are looking, motivation, compensation, timing, logistics, and high-level qualifying questions on the job's core requirements). For each question, if one of the seeker's approved answers fits it, set approvedAnswerId to that answer's id; an answer fits only when its story shows what this interviewer is asking about. Otherwise set approvedAnswerId to null so the seeker can answer it. Never write or rewrite an answer. Do not return a Harper question id, and do not copy a Harper question word for word."
2. Model input and output. Add the seeker's approved INTERVIEW_ANSWER statements (id, the question they answer, exact content) to the person user message. The person likely-question result becomes: question text, approvedAnswerId (or null), and interviewTypeTag.
3. Resolve (resolvePersonLikelyQuestions). Keep the model's question text. When approvedAnswerId matches an approved answer, the code sets the item's answer to that statement's exact text. An unknown id becomes a blank answer. Keep the career walk-through removal.
4. Count. Over the max: keep the first {max} items and save. No minimum and no retry for count. The person call is always one call.
5. Merge (mergePersonLikelyQuestions, rewritten in place). Questions the seeker has answered or kept on the guide stay exactly as stored (their wording and their answer). New questions fill the remaining slots up to {max}, skipping near-duplicates of kept questions. Version-18 items that only referenced a Harper question and have no guide answer from the seeker are replaced.
6. Setting. Add PlatformSetting key guide.likelyQuestionsPerPerson, value { "max": 8 }, default 8 when the row is missing, editable in Super Admin at /platform/harper next to the existing Harper question counts, using the existing settings helpers and page pattern.
7. Display (CheatSheetCoachItems, CheatSheetPersonBody). Each likely question shows its own question text. A copied answer shows as that question's answer with the existing Edit path; an edit saves to the guide question's own turn (cheatSheet:{itemId}) and does not change the original approved answer. A blank answer shows the existing reply box. Make displayedPersonQuestions and sharedGeneralTurnIdsForLikelyQuestions key off what is actually rendered, so no Harper question is hidden or duplicated by mistake.
8. Prompt version. APPLICATION_SUMMARY_PROMPT_VERSION goes from "18" to "19".

STACKING CHECK (before the report)
Search the worktree for each removed name and phrase: LIKELY_QUESTION_MIN, LIKELY_QUESTION_MAX, "4 to 12", "between 4 and 12", "Use one of Harper's General questions", sharedGeneralForCoachItem, cheat-sheet-referenced-general-question, cheat-sheet-shared-general-question, and any assignment of the General question text to a likely question's prompt. Report each search and its results. Any remaining hit must be removed, or explained as used outside person-guide likely questions, with file and line.

TESTS
Choose the minimum checks that prove the change: an approved answer is inserted word for word by id; an unknown or null id gives a blank answer; a list over the setting is trimmed to the max with no retry; the question text renders instead of a Harper card; seeker-answered questions survive regeneration unchanged; the setting defaults to 8. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

REPORT
Files and lines changed; every removed piece, marked removed or kept with a reason; the stacking-check results; the final instruction text as shipped; the new likely-question schema; which checks ran and why; any overlap or conflict found; the estimated input-token change from adding approved answers; and the branch and commit. Do not merge or deploy; this deploys only after owner review.
