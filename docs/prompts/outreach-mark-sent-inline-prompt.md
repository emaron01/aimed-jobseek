Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. Use the existing mark-sent path (markOutreachSentAction and markOutreachSent), existing components, and AppButton; no new colors. No temporary fixes, no data repair, no migrations, no schema changes, no prompt changes. Nothing on the page may make a paid call or enqueue a job. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub or any other in-progress branch. Create a new branch from main (currently 8086ad7) named fix/outreach-mark-sent-inline. If anything unexpected happens, STOP and report.
SURGICAL RULE
Change only the Send Outreach message controls described below. Change nothing else. Add no features.
CONTEXT
On Send Outreach, a message already had a mark-as-sent form with a sent date, placed separately from the "Open in" email buttons, where the seeker did not see it. UI batch 1 then added a "Did you send this message?" prompt that submits the same mark-sent form. The result is two separate ways to mark a message as sent, one of them easy to miss.
CHANGE
1. Report, with file and line, every control on a message that marks it as sent today (the original form with its date field and the batch 1 prompt), and where the "Open in" email buttons, the LinkedIn copy controls, and the resume download sit.
2. Put one "Mark as sent" control, with its sent date (defaulting to today, editable), inline in the same row as the "Open in" email buttons and the resume download, using the existing mark-sent path.
3. Remove the separate, older mark-as-sent form so there is only one inline control per message.
4. Keep the batch 1 "Did you send this message?" prompt with "Yes, mark as sent" and "Not yet", unchanged in wording and behavior; its Yes records through the same path with today's date.
5. A message already marked as sent shows its sent date in that row instead of the control, and still appears under the person's name as sent.
TESTS
Add automated tests that assert: each unsent message shows exactly one inline "Mark as sent" control with a date defaulting to today, in the same row as the "Open in" buttons and the resume download; the older separate form no longer renders; marking as sent records sentAt through the existing path and the message appears under the person as sent; the "Did you send this message?" prompt still appears after opening an email option or copying LinkedIn text and its Yes records through the same path; a sent message shows its date and no control; rendering makes no paid call and enqueues no job. Run the worker boundary test (--conditions=react-server). Run npm test (default parallelism, including real-Postgres tests), plus the exact production build, the full type check, and lint. All must pass with zero errors. Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, commit on fix/outreach-mark-sent-inline with a message naming the inline mark-as-sent control, and push that branch. Do not merge into main or push main.
REPORT
1. Every mark-sent control found before, with file and line.
2. The new inline control, what was removed, and how the prompt still works, with file and line.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside these controls changed.
