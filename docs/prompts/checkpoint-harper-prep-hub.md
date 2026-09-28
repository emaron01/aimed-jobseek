Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Commit only work that is complete and whose full test suite passes. No code changes in this task.

SURGICAL RULE
Git operations only. Do not change any code, tests, configuration, schema, or data. Do not merge into main, push to main, or trigger a deploy.

STEP 1: REPORT THE CURRENT STATE FIRST
1. Run git fetch. Report the current branch, the latest commit on origin/main (hash, date, message), and whether the local branch is ahead of, behind, or diverged from origin/main.
2. List the most recent commits on origin/main (at least the last 20) with dates and messages, and state which of these changes (by their docs/prompts/ prompt and report) are already on origin/main: paid-call audit, Phase 1 guard, serialization, serialization follow-ups, employerIcpFit switch-off and follow-ups, persona build reliability and follow-ups, learned notes feed cheat sheets only, Job Requirements page change, Harper Batch A and its follow-ups, Harper Batch B1, Harper Batch B2 and its unmapped-items fix.
3. List every local commit not on origin/main, and every uncommitted or untracked file (git status).
4. List every migration on origin/main and every migration only in local work, in order.

STEP 2: BACK UP WHAT IS NOT PUSHED
1. Run the full test suite, including real-Postgres tests. If anything fails, STOP and report; commit nothing.
2. Create a branch named checkpoint/harper-prep-hub from the current local state.
3. Commit any uncommitted work in logical commits, one per completed and accepted change, grouped by its prompt and report in docs/prompts/. If a file cannot be clearly assigned, put it with the change it most depends on and say so.
4. Push checkpoint/harper-prep-hub to origin.

STEP 3: DEPLOY PRE-CHECK
Give the exact read-only SQL the product owner should run against the Render database before merging, to find any rows that would make the not-yet-deployed migrations fail (including duplicate active ApplicationJob rows for the PENDING and IN_PROGRESS unique indexes). If those migrations are already on origin/main, say so.

TESTS
Run the full existing test suite, including real-Postgres tests, before committing. Report the result.

REPORT
1. STEP 1 state: what is on origin/main, what is local only, what is uncommitted.
2. The test suite result.
3. The branch name and every new commit (message and files), and any file whose grouping was unclear.
4. Migrations already on origin/main versus only on the checkpoint branch.
5. The read-only pre-check SQL, or confirmation it is not needed.
6. Confirmation that main was not changed and nothing was deployed.
