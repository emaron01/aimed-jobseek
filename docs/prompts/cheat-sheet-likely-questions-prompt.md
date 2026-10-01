Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes, no prompt changes unless reported and approved first. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors. If production data must be read, give the product owner exact read-only SQL to run instead of guessing.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the uncommitted B4 work on checkpoint/harper-prep-hub. Create a new worktree and a new branch from main named fix/cheat-sheet-likely-questions. If main does not include 1251286 (Q&A declutter), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Investigate first. Fix only a display defect that drops likely questions. If the cause is generation (fewer likely questions were generated), do not change generation or prompts: report and STOP on that part. Add no features.

DEFECT (production, application cmuna46te0019r52o11wi0zm0)
On the Interview Cheat Sheet, the person section for Test Maroney (Vice President of Sales, Hiring Team role Hiring Manager) shows only one item under "Likely questions": "Tell me how you have built a predictable sales operating model across new-logo and expansion motions." (with an approved answer). A Hiring Manager is expected to have several likely questions.

INVESTIGATE (file and line)
1. Where a person section's likely questions come from (the person section's guidanceJson likely questions and coach items, Harper turns targeted at that contact, and anything else), and every filter applied before render, including the Cheat Sheet batch 2b changes: displayedPersonQuestions, sharedGeneralForCoachItem, interviewerQuestionMatchesGeneral, personItemHasOwnAnswer, and the removal of per-person Additional Interview Prep Q&A.
2. For this contact, how many likely questions and coach items are stored, and for each one that does not render, exactly which filter removed it. Provide the read-only SQL the product owner can run in Render to list this contact's stored likely questions and coach items from ApplicationSummary.guidanceJson (and any related consultation turns), so the count can be confirmed against production.
3. State plainly which it is: (a) a display defect, where stored likely questions are dropped instead of rendering (for example a question matched to a General question is removed but the shared General card is not rendered under the person); or (b) generation, where only one likely question was stored for this person; or (c) something else.

FIX
- If (a): fix at the root so every stored likely question and coach item for the person renders under that person exactly once, either as its own card or, when it matches a General question, as the shared General card (the same record), per the batch 2b rule. No likely question may disappear.
- If (b): STOP on this part. Report how many likely questions the person-section generator is asked for and returns, where that count is set, and propose options for the product owner, including cost.

TESTS
If (a), add automated tests that actually render a person section and assert: with several stored likely questions, some matching General questions and some not, every one renders under the person exactly once (matched ones as the shared General card); none disappear; rendering makes no paid call and enqueues no job. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, plus the exact production build, the full type check, and lint. All must pass with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
If a fix was made and everything passes, commit on fix/cheat-sheet-likely-questions with a message naming the fix, and push that branch. Do not merge into main or push main. If no fix was made, commit only the saved prompt and report.

REPORT
1. The source of likely questions and every filter, with file and line.
2. For this contact: what is stored, what renders, and why each missing item does not render; the read-only SQL for production.
3. Which case it is (a, b, or c).
4. The fix (with file and line) or the STOP with options and cost.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash, branch, and worktree path.
8. Confirmation that the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 and the B4 work were not touched, no git command discarded work, and nothing outside this fix changed.
