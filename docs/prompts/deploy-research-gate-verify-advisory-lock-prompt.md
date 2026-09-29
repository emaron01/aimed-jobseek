Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Deploy only work that is committed, approved, and whose full test suite, worker boundary test, production build, type check, and lint pass.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. If anything unexpected happens, STOP and report.
SURGICAL RULE
STEP 1 is verification only, unless it fails. STEP 2 is git operations only: merge checkpoint/harper-prep-hub into main and push main.
CONTEXT
The product owner has approved the company research gate and interview guide removal (7bf239d) on checkpoint/harper-prep-hub, subject to STEP 1. Pushing main triggers the Render deploy of the web service and worker.
STEP 1: VERIFY THE CONCURRENCY LOCK
Show, with file and line, how withSubjectLock in src/lib/ai/paid-call-gate.ts works.
- If it uses a database-level lock (for example a Postgres advisory lock scoped to organizationId, operation, and subjectKey, held for the duration of the check and the provider call), so it protects across separate processes and multiple workers, continue to STEP 2 with no changes.
- If it is an in-memory lock (a Map, a promise chain, or anything that only works within one process), STOP: do not merge. Replace it at the root with a Postgres advisory lock keyed by a stable hash of organizationId, operation, and subjectKey, so the second caller waits and then sees the first caller's receipt. Add a test with two separate database connections proving at most one provider call. Run the full suite, the worker boundary test, the build, the type check, and lint; commit on checkpoint/harper-prep-hub with a message naming the fix; push the branch; and report. Do not merge in that case.
STEP 2: DEPLOY
1. Run git fetch. Report main's current commit (expected d595b38), confirm checkpoint/harper-prep-hub contains main, and list every commit in main..checkpoint/harper-prep-hub with its message and whether it changes anything outside docs/. If any commit other than 7bf239d and docs-only commits changes code, STOP and report; merge nothing.
2. Check out checkpoint/harper-prep-hub. Run the full test suite (including real-Postgres tests), the worker boundary test (--conditions=react-server), the exact production build, the full type check, and lint. If anything fails, STOP and report; merge nothing.
3. Merge checkpoint/harper-prep-hub into main as a fast-forward. If a fast-forward is not possible, STOP and report why.
4. Push main to origin.
5. List any migrations this deploy will apply (expected: none).
TESTS
Run the full test suite including real-Postgres tests, the worker boundary test, the production build, the type check, and lint before merging. Report each result.
REPORT
1. STEP 1 finding, with file and line, and any fix made (in which case no merge).
2. Every commit in the range.
3. Test suite, worker boundary test, build, type check, and lint results.
4. main before and after (commit hashes), and confirmation the merge was a fast-forward.
5. Migrations this deploy will apply.
6. Confirmation that nothing was force-pushed and no work was discarded.
7. What the product owner should check in Render: the build succeeded and both the web service and the worker are running and processing jobs.
