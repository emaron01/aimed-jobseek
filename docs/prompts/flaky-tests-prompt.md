Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix each flaky test at its root: make the test deterministic without weakening what it proves. No temporary fixes, no skipped or deleted tests, no retries-until-pass, no blanket timeout increases that hide real slowness, no changes to product behavior. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub or any other in-progress branch. Create a new branch from main named fix/flaky-tests. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only test reliability. Do not change application code unless a flake reveals a real product defect; in that case STOP on that test and report the defect for the product owner. Add no features.

CONTEXT
Several tests fail only when the full suite runs in parallel and pass alone, so recent runs have used --maxWorkers=2 --no-file-parallelism as a workaround. Known flakes:
- paid-call-advisory-lock.test.ts, "different subjects run in parallel": asserts elapsed time below 900ms; failed with 930, 951, and 1571ms under load.
- harper-ignore-worker-e2e: timed out under parallel load.
- 5-second timeouts under parallel load in caching-phase2-batch1, caching-phase2-batch2, caching-phase2-batch3, and application-summary tests.

TASK
1. Run the full suite with the project's default parallel settings at least three times and list every test that fails in any run but passes alone, with its failure message.
2. For each, find the root cause (for example wall-clock timing assertions, shared database state between files, fixed ports or ids, connection pool exhaustion, test ordering, real timers, or advisory locks contending across files) and fix it deterministically:
   - timing assertions: prove the behavior (for example that two different subjects ran concurrently, by recorded overlap or ordering) instead of measuring milliseconds;
   - shared database state: isolate data per test file (unique ids or schemas, transaction rollback, or cleanup);
   - timeouts: remove the cause of slowness under load (for example pool limits or serialized fixtures), and set a per-test timeout only where a test is legitimately long, with the reason stated.
3. Confirm the fixes by running the full suite with the default parallel settings five times in a row with zero failures, and once with --maxWorkers=2 --no-file-parallelism.
4. Report the default command deploys should use going forward.

TESTS
The full suite must pass five consecutive times at default parallelism, plus the worker boundary test (--conditions=react-server), the exact production build, the full type check, and lint, all with zero errors. Never change what a test proves only to make it pass; report every test changed, what it proved before, and what it proves now.

COMMIT
After everything passes, commit on fix/flaky-tests with a message naming the flaky test fixes, and push that branch. Do not merge into main or push main.

REPORT
1. Every flaky test found, its failure, and its root cause.
2. Each fix, with file and line, and confirmation it proves the same behavior as before.
3. Any product defect found (and stopped on).
4. The results of the five default-parallel runs and the sequential run; the worker boundary test, build, type check, and lint results.
5. The recommended test command for deploys going forward.
6. Every file changed.
7. The commit hash and branch pushed.
8. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and no application behavior changed.
