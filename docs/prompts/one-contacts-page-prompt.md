Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. One Contacts page and one add-contact workflow: reuse the existing AddContactForm, addApplicationContactAction, and addApplicationContact service (the Send Outreach path); no parallel implementation. Use existing components, design tokens, and AppButton; no new colors. No temporary fixes, no data repair, no migrations, no schema changes (hidden columns' data stays stored), no AI prompt changes. Adding a contact does exactly what it does on Send Outreach today; add no new paid call. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from main named fix/one-contacts-page. If main does not include 390b89e (Caching Phase 3), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the four items below. Change nothing else. Add no features.

PRODUCT OWNER DECISIONS
1. There is one Contacts page: the main-navigation Contacts page (contacts across all applications, with the Application filter and Search). The per-application Contacts page is retired.
2. Opened from an application, the Contacts page arrives filtered to that application and shows "Add Contact" and "Back to application" (returning to that application's workspace). Opened from the main navigation, it shows "Add Contact" and no "Back to application".
3. Columns, in this order: Name, Title, Company, Hiring Team role, Email, Application, and Edit. Remove the Owner column, the Suppression column with its Opt out control, and the "Not scored for this campaign · 0 sent" text. Keep "Show archived contacts", the Application filter, and Search as they are.

ITEM 1: One Contacts page
1. Report, with file and line, both Contacts pages today (the main-navigation page and /campaigns/{id}/contacts), their data loading, columns, controls, and every link that points to each.
2. Make /campaigns/{id}/contacts redirect to the main Contacts page filtered to that application (for example /contacts?application={id}), so existing links and bookmarks keep working. Point every in-app link for an application's contacts (including the application sidebar's Contacts link) to that filtered page.
3. On the main page, when an application filter came from an application, show "Add Contact" and "Back to application" in the header (where the per-application page had them); otherwise show "Add Contact" only.

ITEM 2: Columns
Apply decision 3. When a contact belongs to more than one application, show each application with that contact's Hiring Team role on that application (report how this is displayed). Do not delete any stored data.

ITEM 3: Add Contact on the one page
"Add Contact" opens the existing AddContactForm and submits addApplicationContactAction, exactly as on Send Outreach, with the same fields and validation. A contact belongs to an application and needs a Hiring Team role:
- From an application (filtered context), the application is set and the Hiring Team role choices are that application's roles.
- From the main navigation, the form first asks which application (required), then offers that application's Hiring Team roles.
After saving, the new contact appears in the list immediately, every page that shows that application's contacts is revalidated, and the seeker stays on the Contacts page with the same filter.

ITEM 4: Readable sidebar highlight
The current-page highlight shipped in 40319dd for the application sidebar's Contacts link is unreadable (dark blue text on the navy sidebar), because that link sits directly on the sidebar background rather than on a white card like the numbered steps. Make the application sidebar's Contacts link render the same way the numbered steps do (on the same card surface) so the shared current-page treatment is readable, and highlight it when the Contacts page is filtered to that application. The main navigation's own links are unchanged.

TESTS
Add automated tests that actually render the components and assert:
- ITEM 1: /campaigns/{id}/contacts redirects to the main Contacts page filtered to that application; the application sidebar's Contacts link points there; filtered from an application, the header shows Add Contact and Back to application, and Back to application returns to that application; from the main navigation, only Add Contact shows.
- ITEM 2: the columns are exactly Name, Title, Company, Hiring Team role, Email, Application, Edit; Owner, Suppression, Opt out, and the scoring text no longer render; a contact on two applications shows each application with its Hiring Team role; Show archived contacts, the Application filter, and Search still work.
- ITEM 3: Add Contact from an application uses that application and its roles; from the main navigation the form requires choosing an application and then offers its roles; saving uses the Send Outreach action and service, the contact appears in the list, and the filter is kept; follow-on work matches Send Outreach exactly, with no other paid call.
- ITEM 4: the application sidebar's Contacts link renders on the step card surface, is readable, and has the current-page treatment and aria-current="page" when the Contacts page is filtered to that application, and not otherwise.
- Rendering makes no paid call and enqueues no job.
Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/one-contacts-page with a message naming the single Contacts page, columns, Add Contact with application choice, and readable sidebar highlight, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: both pages before, the redirect, every link updated, and the header behavior, with file and line.
2. ITEM 2: the columns, what was removed, and how multi-application contacts display.
3. ITEM 3: the Add Contact flow in both contexts, with file and line, and confirmation it reuses the Send Outreach form, action, and service.
4. ITEM 4: the sidebar change, with file and line.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
7. The commit hash, branch, and worktree path.
8. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these four items changed.
