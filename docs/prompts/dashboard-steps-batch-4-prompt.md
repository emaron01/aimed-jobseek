[BUILD + DEPLOY] Application Dashboard: open steps in place (batch 4: Interview Preparation Guides)

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Follow docs/prompts/dashboard-steps-in-place-report.md and the batch 1–3 pattern (DASHBOARD_IN_PLACE_STEP_KEYS, loadDashboardInPlacePanels, DashboardInPlaceStepPanels, DashboardOpenSection, Close at top and bottom). Production-grade code; no temporary fixes.

NO STACKING, NO CONFLICTS
Use the existing in-place pattern only. Per the report, the guides step is the summary page itself: do the small extract so the full Interview Preparation Guides page and the dashboard panel render one shared component. Never copy content. Remove code this change replaces, and tests that only cover it. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named feat/dashboard-steps-batch-4. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Change only the guides step. Harper Questionnaire keeps its current link behavior. The full guides page, each person's guide, and printing keep working exactly as today. Opening the card never makes a paid call, enqueues a job, or generates or regenerates a guide; those stay behind their existing buttons.

CHANGE
1. Interview Preparation Guides opens in place on the dashboard, with Close at the top and bottom and an "Open full page" link. It shows the same primary cards as the full page, in the same order (Interview Personas, Prep by Title, General Study Questions, Consolidated Interview Notes, Position, Full Company Profile, if each is shown there today). Inner sections stay collapsed per DashboardOpenSection.
2. Links from the panel into a person's guide or a printout go to the existing pages, unchanged.
3. Actions inside the panel (for example Create Interview Prep Guide, Regenerate, Polish my answer, Approve, Edit) refresh the dashboard step state and keep the panel open.

TESTS
Choose the minimum checks that prove the change: the guides panel renders the shared component under its card's row; Close removes it from the query string; opening it makes no paid call, enqueues no job, and generates nothing; the full guides page and a person guide page still render. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

DEPLOY
On passing checks: merge the latest origin/main into the branch, then push to main as a fast-forward (git push origin HEAD:main). If it is not a fast-forward, stop and report. Confirm the deploy happened and report the main commit.

REPORT
What was extracted and how the full page and the panel share it; files and lines changed; code and tests removed; which checks ran and why; any overlap found; and the main commit deployed (required).
