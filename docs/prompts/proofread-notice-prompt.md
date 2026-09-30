Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Use the app's existing notice or callout component and styles; no new colors. No temporary fixes, no data repair, no migrations, no schema changes, no prompt changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub or any other in-progress branch. Work on the existing branch fix/proofread-notice (created from main at 33e160d) in its existing worktree C:\Repos\aimed-jobseek-proofread-notice. Do not create another branch or worktree. If anything unexpected happens, STOP and report.

SURGICAL RULE
Add only the notice below. Change nothing else. Add no features.

NOTICE
At the top of the Resume and cover letter page (ApplicationAssetsSection on the assets focus), above both documents, show this text in bold inside the app's existing warning notice style (rounded-md border border-warning bg-warning-tint with text-warning, as already used in the app), always visible and not dismissible:
Proofread your resume and cover letter before you send them. Harper is AI and can make mistakes.
It shows whether or not a resume or cover letter has been generated yet.

TESTS
Add automated tests that assert the notice renders at the top of the Resume and cover letter page with the exact text, in bold, in the existing notice style, not dismissible, both before and after documents exist; and that rendering makes no paid call and enqueues no job. Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors. If the known load flake in paid-call-advisory-lock.test.ts ("different subjects run in parallel") fails under the full suite, re-run it alone and report it; any other failure must be fixed. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/proofread-notice with a message naming the proofread notice, and push that branch. Do not merge into main or push main.

REPORT
1. Where the notice renders and which existing component and style it uses, with file and line.
2. Every file changed.
3. Tests added or changed, with reasons for any changed existing test; flakes by name; the worker boundary test result; the test suite, build, type check, and lint results.
4. The commit hash and branch pushed.
5. Confirmation that no git command discarded work and nothing outside this notice changed.
