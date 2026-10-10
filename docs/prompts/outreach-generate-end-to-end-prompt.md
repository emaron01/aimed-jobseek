[BUILD + DEPLOY] Send Outreach: fix Generate end to end (email, LinkedIn note, InMail) + spinner

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix the root cause from the code on the latest origin/main and the production evidence, so Generate works end to end for every outreach type. No retry loops, no fallback that hides an error. Give the product owner exact read-only SQL for anything you need from production.

NO STACKING, NO CONFLICTS
Fix the existing outreach job, save, and status path in place. Reuse the app's existing spinner pattern. Remove any code the fix replaces. Report any overlapping code, including the ad9ff55 outreach fix and the optional-null fix (fix/ai-optional-null) if it is on main.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/outreach-generate-end-to-end, and report the origin/main commit. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Fix only Send Outreach generation and add the spinner. No AI instruction, prompt-version, or paid-call fingerprint change; if the fix needs one, STOP and report without deploying.

CONTEXT
On the live Sift application (cmux4btmv0005p32prkebgtka), Send Outreach Generate (email, Ashley Cobb) spins and the message never appears. Opening the application showed "The message couldn't be generated. Please try again." with Retry. Production UsageEvent shows exactly one EMAIL_GENERATION call, gpt-5.6-luna, status SUCCESS, at 2026-10-10 12:27:13 UTC. So the model call succeeded and the failure is after it returns (parse, claim validation, save, receipt, job status, or how the UI reads the result). The web logs show POST /campaigns/cmux4btmv0005p32prkebgtka?open=outreach about once a second with the same 1,205-byte response for minutes.

CHANGE
1. Find the step after the AI call that fails, with file and line, and fix it at the source. Give read-only SQL to pull this application's latest outreach job rows (status, error), the PaidCallReceipt for that call, and any saved message for Ashley Cobb.
2. Walk the full path for all three types (email, LinkedIn connection note, InMail) the same way and fix any other step that would fail, so all three generate, save, and show.
3. If a receipt was stored for the 12:27 call, Retry reuses it with no second paid call.
4. A failed job ends cleanly: the worker does not retry beyond the existing policy, the UI stops polling, shows the plain failure message once with Retry, and Retry starts exactly one new attempt.
5. Status polling runs only while a job is queued or running, and never enqueues a job or makes a paid call.
6. Spinner: while a message is being generated for the selected person, show a spinner directly under the Generate button with "Writing your message… this can take about a minute." It follows the job's status, so it stays visible across a page or panel refresh, and disappears when the message appears or the failure message shows. The Generate button stays as it is. Works on the dashboard panel and the full Send Outreach page.

TESTS
Choose the minimum checks that prove the change: email, LinkedIn note, and InMail each generate, save, and show, and polling ends; a failure after the AI call ends polling, shows the plain message once, and Retry reuses the receipt with no second paid call; polling makes no paid call or enqueue; the spinner shows while queued or running and hides when done or failed. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

DEPLOY
On passing checks (and only if the SURGICAL RULE did not stop it): merge the latest origin/main into the branch, then push to main as a fast-forward (git push origin HEAD:main). If it is not a fast-forward, stop and report. Confirm the deploy happened and report the main commit.

REPORT
The root cause with file and line, and the commit that introduced it; anything else found and fixed for LinkedIn note and InMail; the SQL; whether the 12:27 result was recovered; how the spinner follows the job; files and lines changed; which checks ran and why; any overlap found; and the main commit deployed (required).
