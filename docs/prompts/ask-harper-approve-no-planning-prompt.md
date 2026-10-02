Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations or schema changes, no AI prompt changes. Deploy only work whose full test suite, worker boundary test, production build, type check, and lint pass, run against exactly the commit being deployed, in its worktree. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Work in C:/Repos/aimed-jobseek-ask-harper on fix/ask-harper (at 3005706), committing on top of it. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the item below, then deploy. Change nothing else. Add no features.

ITEM: Approving an Ask Harper answer must not queue Harper planning
Today approveConsultationQaResultAction (src/app/actions/consultation.ts about lines 564-573) enqueues a CONSULTATION job with { operation: "continue" } after any approval, including an Ask Harper answer (targetKey ask-harper:...). That continue job can make a paid planning-model call when the approval closes a round with gaps still open. Ask Harper questions are not part of Harper's planning rounds.
1. Report, with file and line, every approve path an Ask Harper answer can go through (including approving after Edit, and any statement-level approve) and what each enqueues.
2. Fix at the root so approving an Ask Harper answer enqueues no continue job and makes no paid call: the answer is approved and appears in General Questions and the best-practice questions as it does now, and nothing else runs. Approving every other kind of answer behaves exactly as today.

TESTS
Add automated tests that assert: approving an Ask Harper answer (on first draft and after an edit, through every approve path found) enqueues no continue job and makes no paid call, and the approved answer still appears once in Cheat Sheet General Questions and once in Harper's best-practice questions; approving a non-Ask-Harper answer still enqueues the continue job exactly as before; rendering makes no paid call and enqueues no job. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, in the worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

DEPLOY (only if every check above passes with zero errors)
1. Commit on fix/ask-harper with a message naming no planning job when approving Ask Harper answers, and push the branch.
2. Run git fetch. Confirm origin/main is 47297ba and the only commits in origin/main..fix/ask-harper are 3005706 and this commit. Otherwise STOP and report; do not deploy.
3. Fast-forward origin/main to the tip of fix/ask-harper by pushing it to main (fast-forward only; never force). If a fast-forward is not possible, STOP and report.
4. Confirm no migrations are in the range.
If any check fails, do not deploy: report the failure and leave the branch pushed.

REPORT
1. Every approve path found and the fix, with file and line.
2. Every file changed.
3. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
4. The commit hash; main before and after; confirmation the push was a fast-forward (or that nothing was deployed, and why).
5. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside this item changed.
6. What the product owner should check in Render: the build succeeded, both services are running, the Ask Harper line and orange button show above the header on Harper, Interview Notes, and the Cheat Sheet, asking a question produces a draft to approve, an approved answer appears in General Questions, and the side navigation reads Application Status, Job requirements, Company.
