[BUILD + DEPLOY] Application Dashboard: open steps in place (batch 1: setup, Status, Job requirements, Company Research)

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Follow docs/prompts/dashboard-steps-in-place-report.md (on branch report/dashboard-steps-in-place, worktree C:/Repos/aimed-jobseek-dashboard-steps-in-place; read it there or copy it into the new worktree). Production-grade code; no temporary fixes.

NO STACKING, NO CONFLICTS
The dashboard and the full page must render the same shared component for each step. Never copy a page's content into the dashboard. Remove code this change replaces, including the duplicate Application Status block under the cards and any tests that only cover replaced behavior. Do not mount ApplicationWorkspace once per card. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named feat/dashboard-steps-batch-1. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree.

SURGICAL RULE
Build only the shared expand-in-place pattern and these three cards: Application Status, Job requirements, Company Research. All other step cards keep their current link behavior until later batches. The full step pages keep working exactly as today. No paid call, job enqueue, or AI instruction change.

CHANGE
1. Expand-in-place pattern (reusable by later batches), following the NewInterviewForm model in the report:
   - Clicking a card opens its content directly below that card's row, spanning the full width of the steps area. On mobile (one column) it opens directly below the card.
   - The clicked card stays where it is; the page does not jump.
   - Clicking again collapses it.
   - Open cards are kept in the query string, so a save or router.refresh() keeps them open.
   - Content loads only when the card is open, and opening a card never makes a paid call or enqueues a job.
   - Each open card shows an "Open full page" link to the existing page.
2. Application Status: the card opens the existing Application Status section. Remove the duplicate block currently rendered under the cards.
3. Job requirements and Company Research: do the small extract described in the report, so the full page and the dashboard render one shared component.
4. Saves inside an open card refresh the dashboard step states and counts (step-progress.ts) without a full page reload.

TESTS
Choose the minimum checks that prove the change: opening a card renders its shared component below the card's row; the open state survives a refresh; opening a card makes no paid call and enqueues no job; the full pages still render. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

DEPLOY
On passing checks: merge the latest origin/main into the branch, then push the branch commit to main as a fast-forward (git push origin HEAD:main). Do not run a bare git push. If it is not a fast-forward, stop and report. Confirm the deploy and report the main commit.

REPORT
Files and lines changed; the shared expand pattern and how later batches use it; code and tests removed; which checks ran and why; any overlap found; and the main commit deployed.
