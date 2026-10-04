Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix the root cause. Harper's best-answer rule applies: she always gives the strongest answer the seeker's information supports and never silently fails; a failed later step never discards an earlier result. No AI instruction text changes unless reported and approved first (report exact current and proposed text and STOP on that part). Every paid call stays behind the paid-call gate. No migrations or schema changes unless reported and approved first; no data repair. Nothing runs on a page view or reruns on its own. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do NOT use C:/Repos/aimed-jobseek (it is on an old branch). Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1, or the fix/research-cleanup or feat/application-dashboard-nav branches or worktrees. Run git fetch, then create a new worktree and a new branch from origin/main named fix/best-practice-missing. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the defect below. Do not merge into main or push main. Change nothing else. Add no features.

DEFECT (production, main at 9fb7dc9 or later, the newest application)
After the lean planning split deployed, a new application's first Harper round produced its gap questions and standing summary, then UsageEvent shows one role_expertise_questions call (gpt-5.6-luna, via ROLE_EXPERTISE_AI_MODEL) followed by three role_expertise_answers calls (gpt-5.6-luna), and the CONSULTATION job COMPLETED. The Harper page still shows "Best-practice questions will appear here when Harper prepares them." after refresh. No best-practice questions are shown.

INVESTIGATE (file and line), including read-only SQL for the product owner to confirm in production:
1. What the questions call returned, and whether any best-practice questions were stored.
2. Why the answers step ran three times: which check rejected each attempt (for example the CAR or STAR parts and outcome checks, which 83feecc and 2f9ec2e relaxed only for Ask Harper, while the answers instructions now also ask for point-of-view and sample answers), and what happened to the questions after the last rejection.
3. Whether storing best-practice questions depends on their answers passing, so a failed answers step drops the questions.
4. Whether the lean split (66836db onward) changed when or how the best-practice fill runs.
5. Whether a stored receipt now blocks the fill from ever retrying on this application (same fingerprint, so no new paid call and still nothing stored).

FIX at the root
- Best-practice questions are stored and shown even if their suggested answers fail; a question without a passing answer shows with no suggested answer rather than disappearing.
- Best-practice answers use the same question-kind handling as Ask Harper: point-of-view, approach, and knowledge questions do not require a story outcome; story questions keep the existing checks; when checks still fail after the bounded retries, store the best actual attempt (the existing closest-answer fallback, never a raw profile fact or placeholder) as the suggested draft.
- An application where the fill already ran and stored nothing recovers through the normal flow without data repair: report exactly how (for example the next Harper round or an existing retry control re-runs the fill once because nothing was stored), and make sure a stored empty result never blocks it forever.

TESTS
Add automated tests (mocked providers, real Postgres) that assert: best-practice questions are stored and shown when their answers fail every attempt; point-of-view best-practice questions get a draft without a required outcome; story questions keep the existing checks; after exhausting retries the closest actual attempt is stored as the draft (never a raw profile fact or placeholder); an application whose fill stored nothing re-runs the fill once through the normal flow and then shows its questions; an identical input with stored questions makes no paid call; rendering makes no paid call and enqueues no job. Run npm test (default parallelism, including real-Postgres tests; database up, not in parallel with the build), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/best-practice-missing with a message naming stored best-practice questions, point-of-view answer handling, and fill recovery, and push that branch. Do not merge into main or push main.

REPORT
1. Findings 1 to 5 with file and line, and the read-only SQL.
2. The fix, and exactly how the affected application recovers.
3. Any instruction change proposed (or STOP), with exact current and proposed text.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
6. The commit hash, branch, and worktree path.
7. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside this defect changed.
