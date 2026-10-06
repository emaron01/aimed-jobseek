[BUILD + DEPLOY] Harper: clearer start button, hide Skip consultation

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
UI only. Copy lives in the product config. Use existing design tokens (an existing lighter green for hover); no new colors. Hide, do not delete: no removal of the skip action's code or data. No schema changes. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/harper-start-clarity. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the three items below. Change nothing else.

ITEMS
1. The green start button on the Harper page reads exactly "Click Here to Start Harper's Coaching Against the Job Requirements". Behavior unchanged.
2. On hover and keyboard focus, the button turns a lighter green with a pointer cursor, so it is clearly a button.
3. Hide the "Skip consultation" button everywhere it appears. Report every place it appeared, with file and line, and anything that depended on it.

TESTS
Choose the minimum relevant tests that prove all three, plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
What changed, with file and line, where Skip consultation appeared and what depended on it, the checks run and results, and main before and after.
