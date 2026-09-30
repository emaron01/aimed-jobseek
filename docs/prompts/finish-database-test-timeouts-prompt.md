Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Tests-only change in STEP 1, following the pattern already used by fix/flaky-tests ({ timeout: 60_000 } on real-Postgres describe blocks). No application code changes. Deploy only work that is committed, approved, and whose full test suite, worker boundary test, production build, type check, and lint pass.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub. Work on fix/ui-batch-1 (currently c30ed78) in its worktree C:\Repos\aimed-jobseek-ui-batch-1. If anything unexpected happens, STOP and report.
SURGICAL RULE
STEP 1 changes test files only. STEP 2 is git operations only.
STEP 1: FINISH THE DATABASE TEST TIMEOUTS
During the UI batch 1 verification, an unrelated consultation-session test timed out at 5007ms against the 5000ms default under full parallelism, then passed on re-run. fix/flaky-tests added { timeout: 60_000 } only to specific real-Postgres suites.
1. List every describe block that uses the real Postgres test database and has no explicit timeout, with file and line.
2. Add { timeout: 60_000 } to each, exactly as fix/flaky-tests did. Change no assertions.
3. Run npm test at default parallelism five consecutive times with zero failures, plus the worker boundary test, build, type check, and lint.
4. Commit on fix/ui-batch-1 with a message naming the remaining database test timeouts, and push that branch.
If any test still fails intermittently after this, STOP and report it by name with its failure; merge nothing.
STEP 2: DEPLOY
1. Run git fetch. Report main's current commit (expected f1a8058), confirm fix/ui-batch-1 contains main, and list every commit in main..fix/ui-batch-1 with its message and whether it changes anything outside docs/ and tests. If any code commit other than c30ed78 is in the range, STOP and report; merge nothing.
2. Merge fix/ui-batch-1 into main as a fast-forward. If a fast-forward is not possible, STOP and report why.
3. Push main to origin.
4. List any migrations this deploy will apply (expected: none).
TESTS
STEP 1's five consecutive default-parallel npm test runs, the worker boundary test, the production build, the type check, and lint must all pass before merging. Report each result.
REPORT
1. STEP 1: every describe block updated, with file and line, and the five run results.
2. Every commit in the range.
3. Worker boundary test, build, type check, and lint results.
4. main before and after (commit hashes), and confirmation the merge was a fast-forward.
5. Migrations this deploy will apply.
6. Confirmation that nothing was force-pushed, no work was discarded, no application code changed in STEP 1, and B4 was untouched.
7. What the product owner should check in Render: the build succeeded, both services are running, and on Harper, the Cheat Sheet, Personas, Send Outreach, and Interview stages the Batch 1 changes appear.
