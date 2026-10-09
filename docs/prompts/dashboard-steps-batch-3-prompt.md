[BUILD + DEPLOY] Application Dashboard: open steps in place (batch 3: Interview Notes, Interviewer Profiles, open panels expanded)

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Follow docs/prompts/dashboard-steps-in-place-report.md and the batch 1–2 pattern (DASHBOARD_IN_PLACE_STEP_KEYS, loadDashboardInPlacePanels, DashboardInPlaceStepPanels, Close at top and bottom). Production-grade code; no temporary fixes.

NO STACKING, NO CONFLICTS
Use the existing in-place pattern only. The dashboard and each full page render the same component (InterviewStagesSection can be mounted as is, per the report; Interviewer Profiles uses the shared ApplicationHiringTeamBody from batch 2). Solve item 3 once in the shared panel pattern (for example a prop on the section wrapper), not with per-step patches. Remove code this change replaces, and tests that only cover it. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Reuse the existing feat/dashboard-steps-batch-3 worktree: run git fetch and merge origin/main into it first. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Change only the items below. The "Add someone you're meeting" form stays exactly as it is. Harper Questionnaire and Interview Preparation Guides keep their current link behavior. Notes themselves keep working exactly as today. Existing data is not changed or deleted. Opening a card never makes a paid call, enqueues a job, or builds roles or personas.

CHANGE
1. Interview Notes opens in place on the dashboard, with Close at the top and bottom and an "Open full page" link.
2. Rename "Personas and Interviewers" to "Interviewer Profiles" everywhere it is shown to the seeker for this step (dashboard card, the section heading, full page heading, navigation, and step labels). Do not rename the "Interview Personas" card inside Interview Preparation Guides.
3. Open panels show their content. Today an open dashboard panel can show only a collapsed section header (for example "▶ Personas and Interviewers"), so it looks like nothing opened. In every dashboard panel (all current steps and all later ones), the step's outer section opens expanded. Everything inside it keeps its current collapsed default: individual profiles, Harper sections, and any other inner collapsible sections stay collapsed. Full pages keep their current behavior.
4. The unused focus="all" path in ApplicationWorkspace, which batch 2 reported can load the model and then the bodies again: if no route or caller uses it, remove it. If something uses it, report the caller and leave it.

TESTS
Choose the minimum checks that prove the change: Interview Notes renders in place under its card's row and Close removes it from the query string; the step shows "Interviewer Profiles"; an open panel's outer section is expanded while inner profiles stay collapsed; the full Interview Notes and Interviewer Profiles pages still render. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

DEPLOY
On passing checks: merge the latest origin/main into the branch, then push to main as a fast-forward (git push origin HEAD:main). If it is not a fast-forward, stop and report. Confirm the deploy happened and report the main commit.

REPORT
Where the old name appeared and what changed; how item 3 was solved in the shared pattern and which panels it covers; the focus="all" finding; files and lines changed; which checks ran and why; any overlap found; and the main commit deployed (required).
