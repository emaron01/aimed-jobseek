Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Use the existing primary design token and existing components; no new colors. No temporary fixes, no data repair, no migrations, no schema changes, no prompt changes. Nothing on any page may make a paid call or enqueue a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub or any other in-progress branch. Create a new branch from main named fix/sidebar-current-step. If main does not include 13c7a49 (Cheat Sheet batch 2b), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Change only the application sidebar's current-step treatment, per section E of docs/prompts/cheat-sheet-batch-2-plan-report.md. Do not retitle any page. Change nothing else. Add no features.

CONTEXT
Moving between Harper and the Interview Cheat Sheet, the seeker cannot easily tell where they are. The sidebar tracker (ApplicationSidebarTracker.tsx) marks the current step with aria-current="page" and a small marker (bg-primary), but the current row uses the same surface as the other rows.

CHANGE
Give the current row in the application sidebar tracker a clearly visible current-page treatment using the existing primary token (for example a primary-tinted background, a primary left border, and primary-colored text), in addition to the existing marker, on every application step, including Harper and the Interview Cheat Sheet. Non-current rows are unchanged. Keep aria-current="page" and the existing isCurrent logic (applicationStepFromPathname and step-progress.ts).

TESTS
Add automated tests that actually render the tracker and assert: on the Harper route the Harper row has the current-page treatment and aria-current="page", and no other row does; the same on the Interview Cheat Sheet route and one other step; non-current rows keep their existing appearance; rendering makes no paid call and enqueues no job. Run the worker boundary test (--conditions=react-server). Run npm test (default parallelism, including real-Postgres tests), plus the exact production build, the full type check, and lint. All must pass with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/sidebar-current-step with a message naming the sidebar current-step treatment, and push that branch. Do not merge into main or push main.

REPORT
1. The treatment applied, the existing token and classes used, with file and line.
2. Every file changed.
3. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
4. The commit hash and branch pushed.
5. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside the sidebar treatment changed.
