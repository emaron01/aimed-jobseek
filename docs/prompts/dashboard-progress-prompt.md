[BUILD + DEPLOY] Dashboard spinners, Harper refresh, and progress top bar

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix root causes. Reuse the existing workspace job refresher, spinner component, and step status logic; no new polling loops. Copy lives in the product config. No schema changes. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/dashboard-progress. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the three items below. Change nothing else.

ITEMS
1. Application Dashboard live status: on a new application, while background work runs (posting parse, research, Hiring Team, Harper, and the rest), each Application steps card shows the same spinner used on other pages, and when that work finishes the card updates to its done (green) state without a manual refresh, the same way the other application pages update.
2. Harper refresh defect: on the Harper page, after Harper's work finished, the page kept showing spinners and did not show the results until a manual refresh. Find the root cause, with file and line, and fix it so the Harper page updates on its own when the work completes, like the other pages.
3. Top bar on every application page: replace "Workspace" with "{application name} Workspace", followed by a progress line in exactly this form:
Currently Completing: {step} · Next Up: {step}
"Currently Completing" is the step with work running, or otherwise the first step in the dashboard's step order that is not done; "Next Up" is the next step after it in that order that is not done. When every step is done, show only the application name. Use the same step names and order as the dashboard, and update live with the rest of the page. Pages outside an application keep their current top bar.

TESTS
Choose the minimum relevant tests that prove each item, plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
1. Each item: what changed, with file and line, and the Harper refresh root cause.
2. The checks run and results, and main before and after.
