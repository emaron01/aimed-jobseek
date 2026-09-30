Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Deploy only work that is committed, approved, and whose full test suite, worker boundary test, production build, type check, and lint pass.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub. If anything unexpected happens, STOP and report.

SURGICAL RULE
Git operations only: merge fix/flaky-tests into main and push main. Do not change any code, tests, configuration, schema, or data.

CONTEXT
The product owner has approved 2ff3c72 (flaky test fixes; tests only, no application code) on fix/flaky-tests, plus docs-only commits. Pushing main triggers the Render deploy of the web service and worker.

TASK
1. Run git fetch. Report main's current commit, confirm fix/flaky-tests contains main, and list every commit in main..fix/flaky-tests with its message and files. If any commit changes a file outside docs/ and test files, STOP and report; merge nothing.
2. Check out fix/flaky-tests (in its worktree C:\Repos\aimed-jobseek-flaky-tests). Run npm test (default parallelism, including real-Postgres tests), the worker boundary test, the exact production build, the full type check, and lint. Any failure: STOP and report; merge nothing.
3. Merge fix/flaky-tests into main as a fast-forward. If a fast-forward is not possible, STOP and report why.
4. Push main to origin.
5. List any migrations this deploy will apply (expected: none).

TESTS
Run npm test at default parallelism, the worker boundary test, the production build, the type check, and lint before merging. Report each result.

REPORT
1. Every commit in the range and its files.
2. Test suite, worker boundary test, build, type check, and lint results.
3. main before and after (commit hashes), and confirmation the merge was a fast-forward.
4. Migrations this deploy will apply.
5. Confirmation that nothing was force-pushed, no work was discarded, and no application code changed.
6. What the product owner should check in Render: the build succeeded and both services are running.
