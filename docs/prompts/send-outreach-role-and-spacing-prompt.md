Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes, no AI prompt changes. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from main (currently f30110a) named fix/send-outreach-role-and-spacing. If anything unexpected happens, STOP and report.
SURGICAL RULE
Fix only the three items below on Send Outreach. Change nothing else. Add no features.
ITEM 1: The Hiring Team role dropdown shows the wrong person's role (data risk)
DEFECT (production): On Send Outreach, with Christina Schivley (Talent Acquisition Partner) selected first and then Test Maroney (Hiring Manager) selected, the "Hiring Team role" dropdown for Test Maroney still shows "Talent Acquisition Partner". Clicking "Save role" would save the wrong role for Test Maroney.
1. Report, with file and line, why the dropdown keeps the previous contact's value (for example an uncontrolled select with defaultValue whose component is reused across contacts without a key), and confirm which contact "Save role" submits for.
2. Fix at the root so the dropdown always shows the selected contact's own stored Hiring Team role whenever the selected contact changes, and "Save role" always saves for the contact currently shown. Check every other per-contact form on Send Outreach (and the shared contact panels) for the same stale-value problem, and fix any found.
ITEM 2: Paragraph spacing in messages
DEFECT: Generated email bodies show paragraphs run together with single line breaks, on screen and in what opens in the seeker's email client.
1. Report, with file and line, how the message body is stored (line and paragraph separators), how it is rendered on screen, and how it is passed to Open in Outlook web, Open in Outlook desktop, Open in Gmail, and the LinkedIn copy.
2. Fix at the root so paragraphs are separated by a blank line on screen and in every handoff (Outlook web, Outlook desktop, Gmail, and LinkedIn copy), while the greeting stays its own paragraph and the sign-off lines (for example "Best," followed by the name) stay together on consecutive lines. Do not change generation or prompts; existing and new messages must both display and hand off correctly.
ITEM 3: "Email ready" appears twice
DEFECT: In the Send Outreach contact list, each contact shows "Email ready" twice.
Report why (for example two statuses rendered for the same message, or two message records), and fix at the root so each contact shows each status once. If there are genuinely two messages, show them distinctly rather than as duplicates, and report what they are.
TESTS
Add automated tests that actually render the components and assert:
- ITEM 1: selecting a second contact shows that contact's stored role in the dropdown; Save role saves for the contact shown and no other; switching back shows the first contact's role; the same holds for any other per-contact form fixed.
- ITEM 2: a stored body with paragraphs renders a blank line between paragraphs on screen; the Outlook web, Outlook desktop, and Gmail handoff bodies and the LinkedIn copy text contain a blank line between paragraphs; the greeting is its own paragraph; sign-off lines stay together.
- ITEM 3: each contact shows each status once.
- Rendering makes no paid call and enqueues no job.
Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. The only failure that may be re-run is the known flake in src/lib/account/wipe-organization.test.ts ("full wipe", wipe log length). Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, commit on fix/send-outreach-role-and-spacing with a message naming the Hiring Team role dropdown fix, message paragraph spacing, and the duplicate status fix, and push that branch. Do not merge into main or push main.
REPORT
1. ITEM 1: why the dropdown kept the old value, which contact Save role submitted for, the fix, and any other forms fixed, with file and line.
2. ITEM 2: how bodies are stored, rendered, and handed off, and the fix, with file and line.
3. ITEM 3: why it showed twice, and the fix.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit, and any flake re-run.
6. The commit hash, branch, and worktree path.
7. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these three items changed.
