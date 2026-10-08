[BUILD + DEPLOY] Application Dashboard: step names and status wording

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Wording only. The rules that decide each step's state do not change. No paid calls, no schema changes, no instruction changes. Copy lives in the product config. Never silence type or lint errors.

NO STACKING, NO CONFLICTS
Change the existing step names and status strings in the product config; the dashboard cards, side navigation, and top-bar progress pills must all read from the same strings, with no second copy. Report any duplicated step names or status strings found.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/dashboard-wording. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below. Change nothing else.

ITEMS
1. Application Status: its done state reads "Applied" instead of "Done".
2. Job Requirements: its done state reads "Successfully uploaded and reviewed by Harper".
3. Company: the step is named "Company Research"; its done state reads "Reviewed and approved by you".
4. Harper: the step is named "Harper Questionnaire"; its in-progress state reads "Please review and respond".
5. Resume and cover letter: its done state reads "Completed and approved by you".
6. Personas and Interviewers: its new state reads "New: Please review and/or update".
7. Send Outreach: unchanged.
8. Interview Notes: its done state reads "Keep your interview notes updated" and keeps the yellow (in-progress) color instead of green.
9. Interview Cheat Sheet: the step is named "Interview Preparation Guides"; its status reads "Review and study for each interview".

TESTS
Choose the minimum relevant tests that prove the new names and wording appear on the dashboard and in the top-bar pills, and that Interview Notes stays yellow when done. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
1. What changed, with file and line.
2. For each step, the current rule that decides its state (not started, in progress, done, and any other), in one plain sentence each, with file and line.
3. Any duplicated strings found, the checks run and results, and main before and after.
