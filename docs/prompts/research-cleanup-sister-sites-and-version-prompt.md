Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. No instruction text changes, no migrations or schema changes, no data repair. Every paid call stays behind the paid-call gate. Nothing runs on a page view or reruns on its own. Deploy only work whose full test suite, worker boundary test, production build, type check, and lint pass, run against exactly the commit being deployed, in its worktree. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, rebase, or any command that discards or moves uncommitted work. Do NOT use C:/Repos/aimed-jobseek (it is on an old branch). Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1, or the fix/best-practice-missing or feat/application-dashboard-nav branches or worktrees. Work in C:/Repos/aimed-jobseek-research-cleanup on fix/research-cleanup (at 2092f55), committing on top of it. If anything unexpected happens, STOP and report.

SURGICAL RULE
Apply only the two items below, then deploy. Change nothing else. Add no features.

ITEM 1: Sister sites must belong to the company
Today sisterHostsFromPageHtml (src/lib/research/sources.ts line 315) treats any domain linked from an anchor-host page as a sister site, except social, news, and job-board hosts. That would accept partners and integrations linked from the company's site (for example crowdstrike.com linked from cscglobal.com) as the employer. Change the rule so a linked domain counts as a sister site only when its registrable domain shares a distinctive name token with the company name or the anchor's registrable domain (for example cscdbs.com shares "csc" with cscglobal.com and with CSC; crowdstrike.com does not). Report the exact rule (how tokens are derived, minimum length, and any words excluded as too generic) with file and line.

ITEM 2: Research version bump
Bump RESEARCH_PROMPT_VERSION from "7" to "8" so the next seeker-started research run on an application uses the key-page reads and sister-site handling instead of returning the stored result. Report exactly what this triggers: nothing runs on its own or on a page view; the next research run the seeker starts (or a save of the website, notes, or posting) pays once; an unchanged input after that makes no paid call.

TESTS
Add automated tests that assert: cscdbs.com linked from cscglobal.com is a sister site for CSC; crowdstrike.com, and a partner domain sharing only a generic word, linked from cscglobal.com is not; social, news, and job-board hosts are still never sister sites; the version is "8" and a matching fingerprint at "8" makes no paid call; every assertion in research-cleanup.test.ts still holds. Run npm test (default parallelism, including real-Postgres tests; database up, not in parallel with the build), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, in the worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

DEPLOY (only if every check above passes with zero errors)
1. Commit on fix/research-cleanup with a message naming company-only sister sites and the research version bump, and push the branch.
2. Run git fetch. Report origin/main's commit. If fix/research-cleanup does not contain origin/main, merge origin/main into it (merge, not rebase); if there is any conflict, STOP and report; then rerun every check above at the merged tip and STOP on any failure.
3. Confirm the only non-merge commits in origin/main..fix/research-cleanup are 2092f55 (research cleanup) and this commit. Otherwise STOP and report.
4. Fast-forward origin/main to the branch tip by pushing it to main (fast-forward only; never force). If a fast-forward is not possible, STOP and report.
5. Confirm no migrations are in the range.
If any check fails, do not deploy: report the failure and leave the branch pushed.

REPORT
1. ITEM 1: the exact sister-site rule, with file and line.
2. ITEM 2: the bump and what it triggers.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit (and after any merge).
5. The commits in the range; main before and after; confirmation the push was a fast-forward (or that nothing was deployed, and why).
6. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.
7. What the product owner should check in Render: the build succeeded, both services are running, existing company sections show paragraphs, numbered citations, and only cited sources, and re-running research on CSC reads its leadership, about, and careers pages.
