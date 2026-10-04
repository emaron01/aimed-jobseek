Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Copy lives in the product config. Use existing components, AppButton, and existing design tokens: the selected navigation style uses an existing light blue token (report which); no new colors. No page, route, or feature is deleted: application pages stay reachable from the dashboard. No migrations, schema changes, data changes, or AI prompt changes. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors. Low-risk (navigation and layout): deploy in this task only if every check passes.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do NOT use C:/Repos/aimed-jobseek (it is on an old branch). Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1, or the fix/research-cleanup branch or worktree. Run git fetch, then create a new worktree and a new branch from origin/main named feat/application-dashboard-nav. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the four items below, then deploy. Do not change what the dashboard page shows beyond its title (its content is a later decision). Change nothing else. Add no features.

ITEM 1: The Application Dashboard
1. The current Application Status page (the application overview with the application header and the Application steps cards) becomes the Application Dashboard. Its page title reads exactly "Application Dashboard". Its content is otherwise unchanged.
2. Opening an application from anywhere (the Applications list, the home page, reminders, search, and any other link to an application) lands on the Application Dashboard. Report every entry point, with file and line.

ITEM 2: Side navigation for an application
1. When an application is selected, the application section of the side navigation shows only one item, labeled exactly "Application Dashboard", linking to the dashboard. Remove the numbered step items (Job requirements, Company, Harper, Resume and cover letter, Personas and Interviewers, Send Outreach, Interview Notes, Interview cheat sheet) and the per-application Contacts item from the side navigation, along with their status icons and badges. Each of those pages stays reachable from the dashboard's Application steps cards. The main navigation (Home, Applications, Contacts, Personal Profile, settings, and the rest) is unchanged apart from ITEM 3.
2. When no application is selected, the application section does not appear.

ITEM 3: One style for selected navigation
Every side navigation item, main and application, uses one style: unselected items are white with black text (as today); the item for the page you are on is light blue with black text, with aria-current="page". Replace the current step highlight (primary left border, tint, primary text) with this style. Report the token used and every navigation item covered.

ITEM 4: Back to dashboard
Every application page other than the dashboard (Job requirements, Company, Harper, Resume and cover letter, Personas and Interviewers, Send Outreach, Interview Notes, the Interview Cheat Sheet, and the Contacts page when filtered to an application) shows a "Back to dashboard" button near the top that returns to that application's dashboard. Replace the Cheat Sheet's existing "Back to application" button with it. Report every page covered, with file and line.

TESTS
Add automated tests that actually render the pages and assert: the dashboard's title is exactly "Application Dashboard" and its content is otherwise unchanged; every application entry point lands on the dashboard; with an application selected, the application navigation shows only "Application Dashboard" and no step items, per-application Contacts, icons, or badges; with none selected, the section is absent; every application page remains reachable from the dashboard's step cards; every navigation item is white with black text when unselected and light blue with black text, with aria-current="page", when on its page; every application page except the dashboard shows "Back to dashboard" returning to that application's dashboard, and the Cheat Sheet no longer shows "Back to application"; rendering makes no paid call and enqueues no job. Run npm test (default parallelism, including real-Postgres tests; database up, not in parallel with the build), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

DEPLOY (only if every check above passes with zero errors)
1. Commit on feat/application-dashboard-nav with a message naming the Application Dashboard, the simplified application navigation, the selected navigation style, and Back to dashboard, and push the branch.
2. Run git fetch. Confirm origin/main is unchanged since this branch was created and the only commit in origin/main..feat/application-dashboard-nav is this commit. If origin/main has moved, merge it into the branch (merge, not rebase); if there is any conflict, STOP and report; then rerun every check and STOP on any failure.
3. Fast-forward origin/main to the branch tip by pushing it to main (fast-forward only; never force). If a fast-forward is not possible, STOP and report.
4. Confirm no migrations are in the range.
If any check fails, do not deploy: report the failure and leave the branch pushed.

REPORT
1. Each item: what changed, with file and line, including every entry point, every navigation item, the token used, and every page with Back to dashboard.
2. Every file changed.
3. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit (and after any merge).
4. The commit hash, branch, and worktree path; main before and after; confirmation the push was a fast-forward (or that nothing was deployed, and why).
5. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.
6. What the product owner should check in Render: the build succeeded, both services are running, opening an application lands on the Application Dashboard, the side navigation shows only Application Dashboard for the application, the current page is light blue with black text, and every application page has Back to dashboard.
