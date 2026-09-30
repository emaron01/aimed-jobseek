Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes, no prompt changes. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub. Work on fix/harper-reply-chain (currently ecdd637), committing on top of it. If anything unexpected happens, STOP and report.
SURGICAL RULE
Correct only ITEM 2 of the reply chain work. Change nothing else. Add no features.
CONTEXT
ecdd637 made saving a reply with the same body reuse one seeker turn, and reset that turn to PENDING if it was already complete. That re-runs extract and polish (paid calls) for unchanged text on a reply that was already finished. Product rule: unchanged inputs never make a paid call.
FIX
1. Report exactly how same-body saves are handled now, with file and line.
2. Resubmitting the same body:
   - If the turn is incomplete (PENDING or FAILED), reuse it and process it once, as a double submit (no second turn, no second run).
   - If the turn is complete and already has a visible outcome under its question (a draft, a follow-up, or the needs-more-detail message), make no paid call and enqueue nothing; show exactly: No Changes To Your Answer.
   - If the turn is complete but has no visible outcome (for example a reply processed before the visible-outcome fix), process it once so it ends in a visible outcome.
3. A changed body (an edit) always processes as today.
TESTS
Add automated tests that assert: a same-body resubmission of an incomplete turn creates no second turn and runs once; a same-body resubmission of a complete turn with a visible outcome makes no paid call, enqueues nothing, and shows exactly "No Changes To Your Answer"; a same-body resubmission of a complete turn with no visible outcome processes once and ends in a visible outcome; an edited body always processes. Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors. If a test fails only under full-suite load and passes alone, report it by name as a flake; do not change it to pass. Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, commit on fix/harper-reply-chain with a message naming the unchanged-reply no-op fix, and push that branch. Do not merge into main or push main.
REPORT
1. How same-body saves were handled before, and the change, with file and line.
2. Where the message renders.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; flakes by name; the worker boundary test result; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside this item changed.
