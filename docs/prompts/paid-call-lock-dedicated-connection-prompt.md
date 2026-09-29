Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. Fix at the root. No temporary fixes, no data repair. No Prisma schema change or migration unless STEP 1 shows one is required, and then STOP for approval first. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. If anything unexpected happens, STOP and report.
SURGICAL RULE
Change only the paid-call gate's concurrency lock (commit bcf40bc on checkpoint/harper-prep-hub). Do not change fingerprints, receipts, prompts, or any caller's behavior. Do not merge into main or push main. Add no features.
CONTEXT
bcf40bc replaced an in-memory lock with pg_advisory_xact_lock inside a Prisma interactive transaction, held for the receipt check and the provider call. Paid provider calls can take minutes (company research especially). Holding a transaction open that long risks the Prisma interactive transaction timeout (default about 5 seconds) and exhausting the connection pool, since the gate is used by every gated paid call and the worker runs 10 jobs at once.
STEP 1: REPORT FIRST
1. The interactive transaction options used (maxWait, timeout), with file and line, and what happens when a provider call exceeds the timeout.
2. The Prisma connection pool size for the web service and the worker in production (from the DATABASE_URL connection_limit or Prisma defaults, and how it is configured), and how many connections the lock design can hold at once with worker concurrency 10.
3. Every caller that goes through withSubjectLock (every PaidCallOperation), and each one's typical provider duration if determinable.
STEP 2: FIX
The lock must protect across processes and workers, and must not hold a Prisma interactive transaction or a pooled Prisma connection open for the duration of a provider call.
Acceptable approaches:
(a) A session-level Postgres advisory lock (pg_advisory_lock / pg_advisory_unlock) on a dedicated connection outside the Prisma pool, always released in finally (including on errors and timeouts), with a bounded wait (pg_try_advisory_lock with retry and backoff, and a maximum wait after which the call proceeds safely or fails cleanly per the existing gate rules). Report how many extra connections it can use at peak and confirm that fits the database's connection limit.
(b) An in-flight lease with an expiry recorded in the database, so a crashed holder never blocks forever. If this needs a schema change, STOP and report the exact change for approval; do not implement it.
Report which you chose and why.
Both approaches must: let the second caller wait and then see the first caller's receipt (no second provider call); never deadlock; release on crash, error, or timeout; and work for calls lasting several minutes.
TESTS
Add automated tests that assert:
- Two callers for the same subject on separate connections make at most one provider call, with the provider call taking longer than the old transaction timeout (use a controlled delay long enough to exceed 5 seconds, or fake timers where valid for the lock).
- A provider call lasting longer than 5 seconds completes and records its receipt.
- The lock is released after a provider error, and the next caller proceeds.
- Different subjects run in parallel without waiting on each other.
- No pooled Prisma connection or interactive transaction is held during the provider call.
Run the worker boundary test (--conditions=react-server) and confirm processApplicationJob still loads cleanly. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, commit on branch checkpoint/harper-prep-hub with a message naming the paid-call lock fix, and push that branch. Do not merge into main or push main.
REPORT
1. STEP 1 findings.
2. The approach chosen and why, with file and line, including release and bounded-wait behavior and peak connection use.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that no git command discarded work and nothing outside the lock changed.
