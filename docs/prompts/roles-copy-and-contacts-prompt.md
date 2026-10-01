Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Copy lives in the product config (src/lib/product-config/), not hard-coded in components. Reuse the existing add-contact form, server action, and service used on Send Outreach (one workflow); no parallel implementation. Reuse the sidebar current-step treatment from 320d112. Use existing components, design tokens, the existing orange warning notice style, and AppButton; no new colors. No temporary fixes, no data repair, no migrations, no schema changes, no AI prompt changes. Adding a contact must behave exactly as it does on Send Outreach, including any paid work it does or does not trigger; add no new paid call. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from main (currently 16a722a) named fix/roles-copy-and-contacts. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the three items below. Change nothing else. Add no features.

ITEM 1: Hiring Team roles text
1. Find, with file and line, the seeker-facing text: "Harper guessed these Hiring Team roles from the job posting and company research. They are assumptions. Confirm or correct them." and every page where it renders.
2. Replace it everywhere it renders with exactly this text, shown inside the existing orange warning notice box (rounded-md border border-warning bg-warning-tint with text-warning, as used for the proofread notice):
Harper identified these Hiring Team roles from the job posting and company research. Select the roles that align to the title or responsibilities of the person who you are interviewing with. NOTE: You can select personas as they are identified.
3. REPORT ONLY (no changes): list every other seeker-facing string that describes Harper's or the product's work with the words "guess", "guessed", "assume", "assumption", or "assumptions", with file and line and the full sentence.

ITEM 2: Add Contact on the Contacts page
DEFECT: The application Contacts page (/campaigns/{id}/contacts) lists contacts (name, title, email, Hiring Team role) with Edit, but has no way to add a contact.
1. Report, with file and line, every existing place a seeker can add a contact (Send Outreach "Add Contact", Harper "Add Interview Contact", the interview stage setup, and any other), the form and server action each uses, its fields, and exactly what each triggers after saving (including any paid call or job).
2. Add an "Add Contact" button in the Contacts page header area, next to "Back to application". It opens the same add-contact form and uses the same server action and service as Send Outreach's "Add Contact", with the same fields (including Hiring Team role) and the same validation.
3. After saving, the new contact appears in the Contacts list immediately (revalidate this page and every page that shows contacts for the application), and the seeker stays on the Contacts page.
4. Adding a contact here triggers exactly what adding one on Send Outreach triggers, nothing more. Report what that is.

ITEM 3: Highlight Contacts in the sidebar when it is the current page
When the seeker is on the Contacts page, give the Contacts sidebar row (below the numbered steps) the same current-page treatment the numbered steps use (primary left border, primary tint, primary text, and aria-current="page"). Apply the same to any other non-step application link in that sidebar when it is the current page. No other row changes.

TESTS
Add automated tests that actually render the components and assert:
- ITEM 1: each page showing the text renders the exact new text inside the orange warning notice box, and the old text no longer renders anywhere.
- ITEM 2: the Contacts page shows "Add Contact"; it opens the same form as Send Outreach with the same fields; saving uses the same action and service, creates the contact on this application, and the contact appears in the list; validation errors show as on Send Outreach; adding here triggers exactly the same follow-on work as on Send Outreach and no other paid call.
- ITEM 3: on the Contacts page, the Contacts sidebar row has the current-page treatment and aria-current="page", and no numbered step row does; on a numbered step page, the Contacts row is not highlighted.
- Rendering makes no paid call and enqueues no job.
Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/roles-copy-and-contacts with a message naming the Hiring Team roles text, Add Contact on the Contacts page, and the Contacts sidebar highlight, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: where the text lived and every page it renders on, with file and line; the other "guess" or "assumption" strings (report only).
2. ITEM 2: every existing add-contact path and what each triggers; the new control, with file and line, and confirmation it reuses the Send Outreach form, action, and service.
3. ITEM 3: the sidebar change, with file and line, and any other non-step links covered.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
6. The commit hash, branch, and worktree path.
7. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these three items changed.
