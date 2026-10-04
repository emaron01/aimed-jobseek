Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Finish the interrupted fix/research-cleanup-2 task (its prompt is in docs/prompts/ in that worktree) without redoing work. Run only the necessary checks below. Do not run the full test suite. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do NOT use C:/Repos/aimed-jobseek. Do not touch any other branch or worktree. Work in C:/Repos/aimed-jobseek-research-cleanup-2 on fix/research-cleanup-2. If anything unexpected happens, STOP and report.

SURGICAL RULE
Do not change any code unless a check below fails because of this task's own changes; then fix only that. Change nothing else.

TASK
1. Make sure no test process is still running from the stopped run (end any leftover vitest or node test processes for this worktree), and that the test database (127.0.0.1:5435) is up.
2. Run git status in the worktree and report the uncommitted changes. Compare them against the five items and the version bump in the original prompt, and report which are complete and which are missing. If anything is missing, STOP and report; do not continue.
3. Run only the test files for the files this task changed (list them and why), then npx tsc --noEmit, the production build, and lint. If any test file fails, re-run only the failed files once; if they pass on their own, treat them as flaky, note them in the report, and continue; if they fail again, STOP and report. Never run the full suite.
4. If all pass, commit on fix/research-cleanup-2 with a message naming clean citations, company website source labels, key page fetching, employer risk filtering, and uncited specifics, and push the branch. Do not merge into main or push main.

TESTS
Only the checks in TASK step 3.

REPORT
1. The state of the worktree and which items are complete.
2. Each check's command, exit code, and result, and any flaky files.
3. The commit hash and branch.
4. The full report the original prompt asked for (items 1 to 7), based on the changes as made.
