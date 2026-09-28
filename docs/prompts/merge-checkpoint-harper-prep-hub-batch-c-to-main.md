SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Deploy only work that is committed, approved, and whose full test suite, production build, type check, and lint pass.

SURGICAL RULE
Git operations only: merge checkpoint/harper-prep-hub into main and push main. Do not change any code, tests, configuration, schema, or data. Do not rewrite history or force-push.

CONTEXT
The product owner has approved Harper Batch C and its corrections on checkpoint/harper-prep-hub: 435fbb0 (Batch C), 9aee7ff (Batch C corrections), d964cdd (approved-answer safety and real CSC fixture), plus docs-only commits. Pushing main triggers the Render deploy.

TASK
1. Run git fetch. Report main's current commit (expected 7a0f6b5), confirm checkpoint/harper-prep-hub contains main, and list every commit in main..checkpoint/harper-prep-hub with its message and whether it changes anything outside docs/.
2. Check out checkpoint/harper-prep-hub. Run the full test suite (including real-Postgres tests), the exact production build, the full type check, and lint. If anything fails, STOP and report; merge nothing.
3. Merge checkpoint/harper-prep-hub into main as a fast-forward. If a fast-forward is not possible, STOP and report why.
4. Push main to origin.
5. List any migrations this deploy will apply (expected: none).

TESTS
Run the full test suite including real-Postgres tests, the production build, the type check, and lint before merging. Report each result.

REPORT
1. Every commit in the range.
2. Test suite, build, type check, and lint results.
3. main before and after (commit hashes), and confirmation the merge was a fast-forward.
4. Migrations this deploy will apply.
5. Confirmation that nothing was force-pushed and no code changed.
6. What the product owner should check in Render: the build succeeded and the web service and worker are both running.
