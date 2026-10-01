Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. One shared mechanism for inline action status across the app (no per-page patches), reusing the existing top-of-page spinner component and the existing workspace job refresher (no new polling). Copy lives in the product config. Use existing components and design tokens; no new colors. No temporary fixes, no data repair, no migrations, no schema changes, no AI prompt changes. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from main (currently 277f625) named fix/live-status-and-reminders. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the three items below. Change nothing else. Add no features. Nothing is sent or blocked by reminders, as today.

ITEM 1: Inline action status is live, with the spinner, and clears when done
DEFECT: After a seeker clicks a save or generate control that starts Harper or other background work, the inline status message next to that control (for example the green "Writing the Interview cheat sheet…" next to Refresh likely questions) is static text. It does not show that work is in progress (the only spinner is at the top of the page, often scrolled out of view), and it stays on screen after the work finishes.
1. Report, with file and line, how inline status messages are produced today (for example ApplicationActionForm's status after an action returns) and every control in the app that shows one after starting background work.
2. Fix at the root in the shared mechanism: when an action starts background work, its inline status shows the same spinner component used at the top of the page, tied to that action's own job (by its job id or key, using the existing workspace job refresher's job list). While that job is pending or running, the spinner and message show; when it completes, the inline status clears; when it fails, the inline status shows the existing failure message instead. A result that starts no work (for example a "No Changes To …" message) shows its message with no spinner. Apply this to every such control.
3. Change the Refresh likely questions status message to exactly: Refreshing likely questions…

ITEM 2: Follow-up reminders show only what is due, one line per application
DEFECT: The Follow-up reminders list shows every future communication (for example Day 3, Day 7, and check-ins days or weeks out), one row each.
1. Report, with file and line, where the Follow-up reminders list is built and rendered, and any other place the same reminders appear (for example a digest email), report only for those.
2. Show only reminders due today or past due, in the seeker's time zone. Group them by application: one line per application with that application's name, the text exactly:
You may have X outbound due. Review Interview stages and Send Outreach to take action.
where X is that application's count of due-today and past-due reminders, followed by the existing Open application link. Applications with nothing due today or past due do not appear. Keep the existing note that nothing is sent or blocked.

ITEM 3: Duplicate thank-you reminder
In production, the same thank-you reminder ("Thank-you for application "CSC Sr. Director" · Record notes first, then generate the thank-you. · due 10/1/2026") appeared twice. Report why (two stored reminders, or one rendered twice), and fix at the root so the same reminder is never stored or counted twice. Report whether existing duplicates are counted once in ITEM 2's count (they must be), without data repair.

TESTS
Add automated tests that actually render the components and assert:
- ITEM 1: after an action starts background work, its inline status shows the shared spinner while its job is pending or running; it clears when the job completes; it shows the failure message when the job fails; a no-change result shows its message with no spinner; this holds for representative controls on Harper, the Cheat Sheet (including Refresh likely questions with the exact new message), Send Outreach, Personas, and Resume and cover letter.
- ITEM 2: only due-today and past-due reminders count; one line per application with the exact text and correct count; applications with nothing due do not appear; future reminders do not appear; the seeker's time zone decides "today".
- ITEM 3: the same reminder is never stored twice, and existing duplicates are counted once.
- Rendering makes no paid call and enqueues no job.
Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/live-status-and-reminders with a message naming the live inline status with spinner, the due-only grouped reminders, and the duplicate reminder fix, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: how inline status worked, every control covered, and the shared fix, with file and line.
2. ITEM 2: where reminders are built and rendered, other places they appear (report only), and the new list, with file and line.
3. ITEM 3: why the thank-you appeared twice, and the fix.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
6. The commit hash, branch, and worktree path.
7. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these three items changed.
