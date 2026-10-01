Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Reuse the in-app reminder logic (one source of truth); no parallel implementation. No temporary fixes, no data repair, no migrations, no schema changes, no AI prompt changes. Nothing is sent or blocked by reminders beyond the existing digest email. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from main named fix/digest-reminder-count. If main does not include 1b26e0e (live status and reminders), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Change only how the digest email counts and describes application reminders. Change nothing else. Add no features.

DEFECT
The home page Follow-up reminders now show only reminders due today or past due in the seeker's time zone, one line per application, with each reminder counted once even if stored twice (src/lib/cadence/application-reminders.ts). The digest email still uses countDueApplicationReminders (src/lib/cadence/digest.ts about lines 265-268), which counts every stored row already due by instant, without calendar-day grouping and without collapsing duplicates, so the email can show a different, higher count than the app.

FIX
1. Report, with file and line, how the digest builds its reminder count and any reminder lines it prints, and how it determines the seeker's time zone.
2. Make the digest use the same logic as the home page: only reminders due today or past due in the seeker's time zone, each reminder counted once (the same reminder identity the home page uses), grouped by application. Where the digest lists reminders, list one line per application with exactly the home page's text, "You may have X outbound due. Review Interview stages and Send Outreach to take action.", and where it shows only a total, the total equals the sum of the home page's per-application counts.
3. A digest with nothing due today or past due does not mention reminders (report what the digest does today in that case and keep its existing send rules otherwise).

TESTS
Add automated tests that assert: for the same seeker and data, the digest's reminder count and per-application lines match the home page exactly; future reminders are not counted; duplicate stored reminders are counted once; the seeker's time zone decides "today"; nothing due means no reminder content. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/digest-reminder-count with a message naming the digest reminder count aligned with the home page, and push that branch. Do not merge into main or push main.

REPORT
1. How the digest counted before, and the change, with file and line.
2. What the digest does when nothing is due.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
5. The commit hash, branch, and worktree path.
6. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside the digest reminder content changed.
