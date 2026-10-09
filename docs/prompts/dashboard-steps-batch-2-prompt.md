[BUILD + DEPLOY] Application Dashboard: open steps in place (batch 2: Close, Status fix, Personas, Resume, Send Outreach)

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Follow docs/prompts/dashboard-steps-in-place-report.md and the batch 1 pattern (DASHBOARD_IN_PLACE_STEP_KEYS in src/lib/application/dashboard-open-steps.ts, loadDashboardInPlacePanels, DashboardInPlaceStepPanels). Production-grade code; no temporary fixes.

NO STACKING, NO CONFLICTS
Use the batch 1 pattern only: add keys and loader branches; do not build a second expand mechanism. The dashboard and the full page must render one shared component per step; never copy content. Remove code this change replaces, and tests that only cover it. Do not mount ApplicationWorkspace once per card. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named feat/dashboard-steps-batch-2. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Change only the items below. Harper Questionnaire, Interview Notes, and Interview Preparation Guides keep their current link behavior until later batches. The full step pages keep working exactly as today. Opening a card must never make a paid call, enqueue a job, or build roles or personas; those stay behind their existing buttons.

CHANGE
1. Close. Every open panel shows a "Close" button at the top (next to "Open full page") and at the bottom. Close removes that step from the open query string with router.replace(..., { scroll: false }). Clicking the card again still collapses it.
2. Application Status bug. On the live dashboard, the Application Status card goes to a page instead of opening in place. Find the cause, fix it so Status opens in place like Job requirements and Company Research, and remove its "Open full page" link (Status has no separate page).
3. Add Personas and Interviewers, Resume and cover letter, and Send Outreach to the in-place pattern, using the small extract described in the report so the full page and the dashboard share one component.
4. Saves inside an open panel refresh the dashboard step states and counts (step-progress.ts) and keep the panel open.

TESTS
Choose the minimum checks that prove the change: Close removes the step from the query string and keeps the scroll position; Status opens in place with no "Open full page" link; the three new steps render their shared component under the card's row; opening them makes no paid call, enqueues no job, and builds no roles; the full pages still render. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

DEPLOY
On passing checks: merge the latest origin/main into the branch, then push to main as a fast-forward (git push origin HEAD:main). If it is not a fast-forward, stop and report. Confirm the deploy happened and report the main commit.

REPORT
The Status bug's cause and fix; files and lines changed; code and tests removed; which checks ran and why; any overlap found; and the main commit deployed (required).
