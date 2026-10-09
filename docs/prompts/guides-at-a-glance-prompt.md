[BUILD + DEPLOY] Interview Preparation Guides: At a Glance as the first card

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Production-grade code in the shared InterviewPrepGuides component (src/app/(app)/campaigns/[id]/summary/page.tsx), so the full page and the dashboard panel both get it. No temporary fixes.

NO STACKING, NO CONFLICTS
Reuse the existing application overview that the summary shell already generates and stores, and the existing "At a glance" display used on person and title guides. Do not add a new AI call, a new stored field, or a second copy of the At a glance markup. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named feat/guides-at-a-glance. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Add only the At a Glance card. The other cards, their order after it, person guides, title guides, and printing stay exactly as they are. No prompt or instruction change, no paid call, no job.

CHANGE
1. On the Interview Preparation Guides page (and therefore the dashboard panel), add "At a Glance" as the first primary card, before Interview Personas, for a general review of the application. It shows the application overview the shell already stores, using the same At a glance display as person and title guides.
2. First confirm where that overview is stored and what it contains. If no stored application-level overview exists, or it is empty for existing applications, STOP and report what exists and what would be needed. Do not generate anything.

TESTS
Choose the minimum checks that prove the change: At a Glance renders as the first card on the full page and in the dashboard panel; the other cards keep their order; no paid call or enqueue is added. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

DEPLOY
On passing checks (and only if step 2 did not stop): merge the latest origin/main into the branch, then push to main as a fast-forward (git push origin HEAD:main). If it is not a fast-forward, stop and report. Confirm the deploy happened and report the main commit.

REPORT
Where the overview is stored and what it contains; files and lines changed; which checks ran and why; any overlap found; and the main commit deployed (required).
