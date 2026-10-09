[BUILD + DEPLOY] Harper: three sections start collapsed

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Production-grade code in the shared ConsultationSection, so the full Harper page and the dashboard panel behave the same. No temporary fixes.

NO STACKING, NO CONFLICTS
Change the existing three Harper sections in place. Reuse the app's existing collapsible section pattern (the same one used elsewhere, for example DashboardOpenSection's inner <details>), not a new one. Do not add a second wrapper or a dashboard-only copy. Remove code this change replaces, and tests that only cover it. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named ui/harper-sections-collapsed. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Change only how Harper's three sections open. Harper's behavior, questions, counts, answers, buttons, and paid calls do not change. The intro text and the Ask Harper box stay visible and unchanged.

CHANGE
1. Harper's three sections start collapsed, on the full Harper page and in the dashboard panel. Each shows its heading (and its existing count, if it has one) so the seeker can open it.
2. A link to a specific question (#harper-q:…, including "Answer Harper's questions" and "Open full page" from the dashboard) opens that question's section and shows the question.
3. Opening or closing a section keeps the page where it is; it does not jump. After an action inside a section (reply, Approve, Regenerate, Polish my answer, Edit, Skip, Permanently Ignore), that section stays open.

TESTS
Choose the minimum checks that prove the change: the three sections render collapsed with the intro and Ask Harper visible; a question link opens its section; a section stays open after an action. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

DEPLOY
On passing checks: merge the latest origin/main into the branch, then push to main as a fast-forward (git push origin HEAD:main). If it is not a fast-forward, stop and report. Confirm the deploy happened and report the main commit.

REPORT
How the sections were made collapsible and how question links open them; files and lines changed; code and tests removed; which checks ran and why; any overlap found; and the main commit deployed (required).
