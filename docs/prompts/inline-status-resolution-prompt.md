Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root in the shared mechanism; no timeouts that hide the real state, no per-page patches, no data repair, no migrations, no schema changes, no AI prompt changes. Nothing on page render makes a paid call or enqueues a job; any status lookup is a read. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Work in C:/Repos/aimed-jobseek-live-status on fix/live-status-and-reminders (at 555e236), committing on top of it. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the inline status edge cases below. Change nothing else. Add no features.

CONTEXT
InlineActionStatus (src/components/InlineActionStatus.tsx) shows the spinner while its job is pending, running, or not yet in the workspace job list, and clears when the job completes. The workspace job refresher stops polling when no job is pending or running.

CHECK AND FIX
1. Fast job: an action's job completes before the refresher's next poll, so it may never appear in the published list as pending or running. Report, with file and line, whether the inline status can then stay on the spinner indefinitely (for example "not yet in the list" while polling has stopped). Fix at the root so the inline status always resolves: it learns the job's final state (completed or failed) even if the job finished before it was ever seen running, for example by including recently completed and failed jobs for the campaign in the published list, or by reading that job's status by id, without new polling loops.
2. Merged or serialized job: when an action's request joins an already pending or running job for the same key (same-key serialization), or the action returns a job id that is not the one that runs. Report, with file and line, which id each action returns in that case and whether the inline status can watch an id that never runs. Fix at the root so the inline status always watches the job that actually does the work, and resolves when that job completes or fails.
3. Gated skips inside a job: a job that completes without a paid call (for example the paid-call gate returning a stored result) must clear the inline status the same way as any completed job.
4. Report any other path where the inline status could stay spinning after the work has ended, and fix it.

TESTS
Add automated tests that actually render InlineActionStatus within the shared provider and assert: a job that completes before the first poll still clears the inline status; a job that fails before the first poll shows the failure message; an action that joins an existing pending or running job watches that job and clears when it completes; a gated skip completion clears the status; the inline status never stays spinning once its job has completed or failed; rendering makes no paid call and enqueues no job. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/live-status-and-reminders with a message naming the inline status resolution fixes, and push that branch. Do not merge into main or push main.

REPORT
1. Each case: whether it could stay spinning, why, and the fix, with file and line.
2. Every file changed.
3. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
4. The commit hash, branch, and worktree path.
5. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside the inline status changed.
