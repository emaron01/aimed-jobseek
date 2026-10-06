[BUILD + DEPLOY] Top bar: progress pills follow the seeker's workflow

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Display logic only. Reuse the existing step states and workspace refresh. No schema changes. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/progress-pill-order. If anything unexpected happens, STOP and report.

SURGICAL RULE
Change only how the top bar's two progress pills choose their steps. The dashboard cards, their numbering, and every step's done rules stay as they are. Change nothing else.

ITEM
The pills use this order instead of the dashboard's step order:
New Application → Job requirements → Company → Harper → Resume and cover letter → Application Status (applied) → Personas and Interviewers → Send Outreach → Interview Notes → Interview cheat sheet

"Currently Completing" is the step with work running; otherwise the first step in this order that is not done. "Next Up" is the next step after it in this order that is not done. When every step is done, only the application name shows, as today.

TESTS
Choose the minimum relevant tests that prove the new order (for example, with Job requirements and Company done and Harper not done: Currently Completing Harper, Next Up Resume and cover letter, even though Application Status is not done). Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
What changed, with file and line, the checks run and results, and main before and after.
