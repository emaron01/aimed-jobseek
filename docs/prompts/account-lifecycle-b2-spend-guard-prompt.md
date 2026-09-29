Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. One shared check; no per-call-site patches, no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.
SURGICAL RULE
Batch B2 only, per section 3, section 6.2, and batch B2 of docs/prompts/account-lifecycle-plan-report.md. Add the shared spend guard to the paid-call gate and the worker. Do not build read-only states (B3), self-serve delete (B4), the scheduled wipe (B5), or change billing behavior. Add no features.
DECISIONS
1. One shared server-side guard (for example assertOrganizationMaySpend in the billing or account module) answers: does this organization exist, and is it allowed to spend? Today "allowed to spend" uses the existing spend-lock rules (isSpendBlocked / assertOrganizationNotPaymentLocked); FREE and COMPED organizations are always allowed. Batch B3 will add read-only to this same guard, so design it as the single place that decision lives.
2. runPaidStructuredCall (src/lib/ai/paid-call-gate.ts) calls the guard before any provider call. If the organization is missing or not allowed to spend, it makes no provider call, writes no receipt, and returns or throws a clear, typed outcome that callers already handle (report exactly what callers receive).
3. The worker: at the start of processApplicationJob and processResearchRun, if the organization is missing, end the job cleanly (terminal state, no retry, no AI call, no tenant writes). If the organization exists but may not spend, end the job cleanly the same way without an AI call. Report the terminal state and reason used.
4. Enqueue: enqueueApplicationJob and the research enqueue refuse to create new paid work for an organization that is missing or may not spend. Report what the calling action receives.
5. No existing behavior changes for organizations that may spend.
TESTS
Add automated tests that assert:
- runPaidStructuredCall makes no provider call and writes no receipt for a missing organization and for a spend-blocked organization; a FREE or COMPED organization and an active organization proceed as before.
- A queued application job and a research run for a deleted organization end cleanly with no AI call and no writes.
- A queued job for a spend-blocked organization ends cleanly with no AI call.
- Enqueue refuses new paid work for a missing or spend-blocked organization.
- After a full wipe, no job, receipt, or research run can re-create data for that organization.
Run the worker boundary test (--conditions=react-server) and confirm processApplicationJob still loads cleanly. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming account lifecycle B2 (spend guard), and push that branch. Do not merge into main or push main.
REPORT
1. The shared guard, with file and line, and its rules today.
2. What runPaidStructuredCall callers receive when the guard refuses.
3. The worker behavior and terminal state for missing and spend-blocked organizations.
4. The enqueue behavior.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that no git command discarded work and nothing outside B2 changed.
