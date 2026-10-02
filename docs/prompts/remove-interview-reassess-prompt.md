Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations or schema changes, no AI prompt changes. Deploy only work whose full test suite, worker boundary test, production build, type check, and lint pass, run against exactly the commit being deployed, in its worktree. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Work in C:/Repos/aimed-jobseek-notes-by-person on fix/notes-by-person (at b8c50b6), committing on top of it. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the item below, then deploy. Change nothing else. Add no features.

ITEM: Removing an interview must not trigger a paid reassess when nothing Harper learned from changed
Today removeInterviewForPerson calls enqueueLearningsReassessIfChanged after deleting a stage, and the learnings fingerprint includes the stage's id, so deleting any interview, including an empty duplicate with no notes, changes the fingerprint and enqueues a paid Harper reassess on the planning model.

1. Report, with file and line, exactly what the learnings fingerprint includes (stage ids, notes text, person notes, dates, outcomes) and why deleting a stage changes it.
2. Fix at the root so removing an interview enqueues a learnings reassess only when content Harper learns from actually changed: for example, when the deleted interview had non-empty stored notesBefore or notesAfter (or any other stage field the learnings input uses). Deleting an interview with none of that content, or unlinking a person from a shared interview, enqueues nothing and makes no paid call. Prefer making the fingerprint depend on the learned content rather than on stage ids, if that is the cleaner root fix, and report which you chose and why, including any effect on other callers of the fingerprint (it must not cause any new reassess for unchanged content elsewhere).

TESTS
Add automated tests that assert: deleting an interview with no stored notes (and no other learned content) enqueues no learnings reassess and makes no paid call; deleting an interview with stored notes enqueues exactly one reassess; unlinking a person from a shared interview enqueues none; other callers of the fingerprint enqueue a reassess only when learned content changes, as before; rendering makes no paid call and enqueues no job. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, in the worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

DEPLOY (only if every check above passes with zero errors)
1. Commit on fix/notes-by-person with a message naming the remove-interview reassess fix, and push the branch.
2. Run git fetch. Confirm origin/main is dc860df and the only commits in origin/main..fix/notes-by-person are b8c50b6 and this commit. Otherwise STOP and report; do not deploy.
3. Fast-forward origin/main to the tip of fix/notes-by-person by pushing it to main (fast-forward only; never force). If a fast-forward is not possible, STOP and report.
4. Confirm no migrations are in the range.
If any check fails, do not deploy: report the failure and leave the branch pushed.

REPORT
1. What the fingerprint included, the fix chosen and why, and its effect on other callers, with file and line.
2. Every file changed.
3. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
4. The commit hash; main before and after; confirmation the push was a fast-forward (or that nothing was deployed, and why).
5. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside this item changed.
6. What the product owner should check in Render: the build succeeded, both services are running, the Interview stages page shows one section per person with Add another interview and Remove, and the duplicate interview with no person can be removed under Not linked to anyone.
