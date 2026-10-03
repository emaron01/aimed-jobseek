Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. No instruction text changes, no migrations or schema changes, no data repair. Every paid call goes through the existing paid-call gate. Nothing runs on a page view or reruns on its own. Deploy only work whose full test suite, worker boundary test, production build, type check, and lint pass, run against exactly the commit being deployed, in its worktree. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Work in C:/Repos/aimed-jobseek-research-coverage on fix/research-coverage (at fee68a1), committing on top of it. If anything unexpected happens, STOP and report.

SURGICAL RULE
Apply only the two items below, then deploy. Change nothing else. Add no features.

ITEM 1: Research version bump
Bump RESEARCH_PROMPT_VERSION (src/lib/research/config.ts) from "6" to "7", so the next seeker-started research run uses the new coverage behavior instead of returning the stored result. Report exactly what the bump triggers: nothing runs on its own or on a page view; the next research run for an application (when the seeker starts or retries it, or saves its website, notes, or posting) makes one paid run; an unchanged input after that makes no paid call.

ITEM 2: Read more of each page
Raise the website excerpt limits used for research from 1,200 characters per page and 4,000 characters total to 4,000 characters per page and 16,000 characters total. Report the constants changed, with file and line, and every place those limits apply. Keep the per-run search cap at 3 and the fetch count limits as they are.

TESTS
Add or update automated tests that assert the version is "7", the per-page and total excerpt limits are 4,000 and 16,000, a long page is cut at 4,000 characters and the combined excerpt at 16,000, and a matching fingerprint at version 7 makes no paid call. Run npm test (default parallelism, including real-Postgres tests; make sure the test database is up first and run it on its own, not in parallel with the build), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, in the worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

DEPLOY (only if every check above passes with zero errors)
1. Commit on fix/research-coverage with a message naming the research version bump and larger page excerpts, and push the branch.
2. Run git fetch. Confirm origin/main is b71cf0b and the only commits in origin/main..fix/research-coverage are fee68a1 and this commit. Otherwise STOP and report; do not deploy.
3. Fast-forward origin/main to the tip of fix/research-coverage by pushing it to main (fast-forward only; never force). If a fast-forward is not possible, STOP and report.
4. Confirm no migrations are in the range.
If any check fails, do not deploy: report the failure and leave the branch pushed.

REPORT
1. ITEM 1: the bump and exactly what it triggers.
2. ITEM 2: the constants changed and every place the limits apply, with file and line.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
5. The commit hash; main before and after; confirmation the push was a fast-forward (or that nothing was deployed, and why).
6. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.
7. What the product owner should check in Render: the build succeeded, both services are running, and re-running research on the CSC application reads more than one source and fills Where this job fits and In depth from CSC's own pages.
