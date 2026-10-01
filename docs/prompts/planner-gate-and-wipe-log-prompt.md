Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. Use the existing paid-call gate (runPaidStructuredCall) exactly as the other operations do: receipts, advisory lock, spend guard, crash safety. Use an atomic database operation for the wipe log. No temporary fixes, no data repair, no migrations or schema changes unless reported and approved first, no prompt text changes. The deletion log stays anonymous (date and reason only). Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from main named fix/planner-gate-and-wipe-log. If main does not include d304e05 (Send Outreach fixes), STOP and report. If anything unexpected happens, STOP and report.
SURGICAL RULE
Implement only the three items below. Change nothing else. Add no features. Seeker-visible behavior stays the same except that an identical repeat request makes no second paid call.
ITEM 1: Harper's planner behind the paid-call gate
planConsultationWithModel (src/lib/consultation/ai.ts) on the planning model (getConsultationAiProvider) is called by planAndStoreRound for start, continue, reassess, and flag-inaccuracy, with a quality loop of up to three attempts, and is not gated.
1. List every call site, with file and line.
2. Route it through runPaidStructuredCall with its own named operation (for example CONSULTATION_PLAN), keyed to the campaign and session, with a fingerprint built from everything that determines the output: the model, CONSULTATION_PROMPT_VERSION, and the full message payload (including quality feedback). Each quality attempt carries different feedback, so it still calls the model; an identical repeat (for example a worker retry of the same job after a crash) returns the stored result and makes no second call.
3. When a stored result is reused after a crash, the round must be stored exactly once: report, with file and line, how planAndStoreRound stores turns, and make sure reusing a stored plan neither skips storing a round that was never stored nor stores a duplicate round that was already stored.
4. Keep the usage step and attempt metadata on every provider call.
ITEM 2: Next-step suggestions behind the paid-call gate
writeApplicationNextStep (src/lib/application/next-step.ts) on the writing model is not gated. Route it through runPaidStructuredCall with its own named operation (for example APPLICATION_NEXT_STEP), keyed to the campaign, with a fingerprint of the model, its prompt version, and its full input. An identical repeat returns the stored result with no second call; changed inputs call the model.
ITEM 3: Atomic deletion log append
The anonymous deletion log (PlatformSetting key account.wipe.log, entries with date and reason only) is appended by reading the stored list, adding an entry, and writing it back, so two deletions at the same moment can lose an entry. The full wipe test also fails intermittently because it compares the log's total length while other tests append to the same shared log.
1. Report, with file and line, how the append works today.
2. Make the append atomic (for example a single update that appends to the stored JSON array in the database, or a row lock within the wipe transaction), so concurrent deletions never lose an entry. Keep entries anonymous.
3. Fix the full wipe test so it proves the same behavior (a wipe records exactly one anonymous entry with the date and the reason) deterministically, without depending on the shared log's total length while other tests run. Report how.
TESTS
Add automated tests that assert:
- ITEM 1: a new plan calls the planning model once and records a receipt; an identical repeat makes no second call and returns the stored result; a quality attempt with new feedback calls the model; a reused stored plan after a simulated crash stores the round exactly once (never zero, never twice); usage step and attempt are recorded; seeker-visible planning outcomes are unchanged.
- ITEM 2: a new next-step request calls the model once; an identical repeat makes no second call; changed inputs call the model.
- ITEM 3: concurrent appends from several simultaneous wipes record every entry with none lost; entries contain only date and reason; the full wipe test passes deterministically.
- Rendering makes no paid call and enqueues no job.
Run npm test (default parallelism, including real-Postgres tests) three consecutive times with zero failures, then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit. Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, commit on fix/planner-gate-and-wipe-log with a message naming the planner and next-step paid-call gates and the atomic deletion log, and push that branch. Do not merge into main or push main.
REPORT
1. ITEM 1: every call site, the operation and fingerprint, how quality attempts and repeats behave, and how the round is stored exactly once on reuse, with file and line.
2. ITEM 2: the operation and fingerprint, with file and line.
3. ITEM 3: how the append worked, the atomic fix, and how the test now proves the same behavior.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit (three suite runs).
6. The commit hash, branch, and worktree path.
7. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these three items changed.
