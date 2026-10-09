[BUILD + DEPLOY] Application Dashboard: open steps in place (batch 5: Harper Questionnaire)

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Follow docs/prompts/dashboard-steps-in-place-report.md and the batch 1–4 pattern (DASHBOARD_IN_PLACE_STEP_KEYS, loadDashboardInPlacePanels, DashboardInPlaceStepPanels, DashboardOpenSection, Close at top and bottom). Production-grade code; no temporary fixes.

NO STACKING, NO CONFLICTS
Use the existing in-place pattern only. Per the report, Harper (ConsultationSection) can be mounted as is: the dashboard panel and the full Harper page render the same component. Never copy content. Remove code this change replaces, and tests that only cover it. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named feat/dashboard-steps-batch-5. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Change only how the Harper Questionnaire step opens. Harper's behavior, instructions, questions, counts, and paid calls do not change. The full Harper page keeps working exactly as today. Opening the card never makes a paid call, enqueues a job, or generates questions or answers; those stay behind their existing buttons. If mounting Harper in the panel would trigger any paid call, job, or Harper generation on open, STOP and report before building.

CHANGE
1. Harper Questionnaire opens in place on the dashboard, from both its card button ("Answer Harper's questions" or its current label) and "Your next step", with Close at the top and bottom and an "Open full page" link.
2. Inner sections stay collapsed per DashboardOpenSection; only the outer section opens.
3. Actions inside the panel (reply, Approve, Regenerate, Polish my answer, Edit, Skip, Permanently Ignore) work as on the full page, refresh the dashboard step state and the "questions need your answer" count, and keep the panel open without the page jumping.
4. Any links or anchors inside Harper that assume its own page (for example jumping to a question) still work in the panel, or go to the full page.

TESTS
Choose the minimum checks that prove the change: Harper renders the shared component under its card's row; Close removes it from the query string; opening it makes no paid call, enqueues no job, and generates nothing; an action inside the panel refreshes the count and keeps it open; the full Harper page still renders. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

DEPLOY
On passing checks (and only if the SURGICAL RULE did not stop it): merge the latest origin/main into the branch, then push to main as a fast-forward (git push origin HEAD:main). If it is not a fast-forward, stop and report. Confirm the deploy happened and report the main commit.

REPORT
How Harper was mounted and anything that assumed its own page; files and lines changed; code and tests removed; which checks ran and why; any overlap found; and the main commit deployed (required).
