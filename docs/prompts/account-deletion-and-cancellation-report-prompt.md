Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
All findings must be based on the actual code and schema as they exist now (main at 14bc322). Cite file paths, function names, model names, and line numbers for every claim. No guesses; if something cannot be determined from the code, say so explicitly.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work.
SURGICAL RULE
REPORT ONLY. Do not change any code, configuration, schema, tests, or data, and do not commit anything except this prompt and its report under docs/prompts/.
QUESTIONS
1. When a seeker deletes their account, is everything that belongs to them removed?
2. When a customer cancels their subscription, what happens to their account and data, and when?
REPORT ON
1. Every way an account can be deleted (the seeker's own account settings, Super Admin, or anything else), with the call chain, and exactly what each deletes: the user, the organization, or both. State how a single-seeker organization versus an organization with other users is handled.
2. Every Prisma model that holds data belonging to a user or organization, and for each: how it is removed on account deletion (onDelete cascade from which relation, an explicit delete in code, or not removed at all). Include at minimum: Personal Profile and stories, applications (campaigns), job requirements, company research and research runs, companies and any seeker-supplied company notes, hiring team roles and personas, contacts and campaign contacts, interview stages and InterviewStageGuide rows, Harper sessions, turns, and statements, cheat sheet and application summary data, resumes, cover letters, outreach assets, application jobs, PaidCallReceipt rows, usage events, voice data, subscription or billing records, sessions, tokens, and invites.
3. Shared data: any table that is not owned by one organization (for example global company records or introducer claims). State what should stay (shared, non-personal data) and whether any personal data the seeker supplied lives in a shared table and would survive deletion.
4. Anything outside the database: uploaded files or resumes in storage, authentication provider records (sessions, accounts), mailbox tokens (Microsoft Graph or others), Stripe customers, email provider records, and anything cached. For each: removed, not removed, or cannot be determined.
5. In-flight work: what happens to PENDING or IN_PROGRESS application jobs and research runs for a deleted account (does the worker fail, crash, retry forever, or skip cleanly), and whether a job can recreate data for a deleted account after deletion.
6. Leftovers: a list of everything that would remain after deletion today, marked personal or non-personal.
7. Whether deleting an account and signing up again with the same email starts completely fresh, or can pick up anything from the old account.
8. Cancellation:
   a. Every way a subscription can be cancelled (the seeker, Super Admin, a Stripe webhook, a failed payment, a trial ending, or anything else), with the call chain, and whether each path can be reached today given Stripe is not yet set up.
   b. What happens to the account at cancellation: whether access is removed immediately or at the end of the paid period, and what the seeker can still see or do.
   c. Data retention after cancellation: whether a retention period exists (for example 30 days), where it is defined, and what is kept during it.
   d. Automatic removal: whether a scheduled job deletes cancelled accounts' data after the retention period. If so: where it is defined, what triggers it (cron route, worker, Render cron job), whether that schedule is actually configured to run in this deployment (for example a Render cron job and CRON_SECRET), and exactly what it deletes, compared with the manual account deletion in section 2.
   e. Reactivation: whether a seeker who resubscribes within the retention period gets their data back, and what happens after it.
   f. Anything this codebase inherited from Aimed Outreach for cancellation or retention that does not fit a job-seeker product, or that references Aimed Outreach concepts.
TESTS
Do not run or write tests. List the tests a fix would add, each with what it asserts, including: a real-Postgres test that creates a fully used account (profile, application, research, Harper Q&A, cheat sheet, resume, outreach, contacts, interviews, jobs, receipts), deletes it, and asserts no row owned by that user or organization remains; and a test that a cancelled account's data is removed after the retention period by the scheduled job, and kept before it.
REPORT
Deliver sections 1 through 8 and the TESTS list, with a short list of risks or unknowns. Save it to docs/prompts/account-deletion-and-cancellation-report.md. Make no code changes.
