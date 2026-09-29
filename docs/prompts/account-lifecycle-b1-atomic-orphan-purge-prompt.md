Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. If anything unexpected happens, STOP and report.

SURGICAL RULE
Correct only the item below in account lifecycle B1 (commit d1534a7 on checkpoint/harper-prep-hub). Change nothing else. Add no features.

ITEM: Orphan user and authentication purge must be part of the atomic wipe
wipeOrganizationAccount deletes the organization inside a transaction (252-270), then runs purgeOrphanedTenantUsersAfterOrgDelete afterwards (272). If that purge fails, a retry hits the "organization missing, alreadyWiped" exit (232-238) and never purges the users, leaving their user record, email, and authentication records behind, and a later signup with the same email would reuse the old user.
- Move the orphan purge (purgeAuthIdentity and user.delete for members with platformRole NONE and no remaining membership) inside the same transaction as the organization delete, using the transaction client, so the wipe either fully completes or changes nothing in the database.
- Keep the Stripe cancellation before the transaction, as today.
- If the transaction timeout needs to change to fit, report the new value and why.
- Keep the multi-organization and platform-operator rules exactly as they are.

TESTS
Add automated tests that assert:
- If the orphan user purge fails, the whole database transaction rolls back: the organization and its data still exist, and running the wipe again completes fully, including the user and authentication purge.
- After a successful wipe, signing up with the same email creates a new user and a new, empty organization (no reuse of the old user).
- Existing B1 tests still pass.
Run the worker boundary test (--conditions=react-server) and confirm processApplicationJob still loads cleanly. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on branch checkpoint/harper-prep-hub with a message naming the atomic orphan purge fix, and push that branch. Do not merge into main or push main.

REPORT
1. What moved into the transaction, with file and line, and the transaction timeout.
2. Every file changed.
3. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
4. The commit hash and branch pushed.
5. Confirmation that no git command discarded work and nothing outside this item changed.
