Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. If anything unexpected happens, STOP and report.

SURGICAL RULE
Correct only the items below in Caching Phase 2 batch 1 (commit fb20d6b on checkpoint/harper-prep-hub). Change nothing else. Add no features.

ITEM 1: Record the background receipt only after the reassess succeeds
CONSULTATION_SEEKER_BACKGROUND_REASSESS currently records its receipt when the reassess is enqueued. If that job fails, re-saving the same text never retries.
- Record the receipt only after the reassess completes successfully (the same pattern as the D7 learnings gate, recorded in reassessConsultationStanding or its equivalent). Before enqueueing, compare against the last successful receipt.
- An existing queued or running reassess for the same input must not cause a duplicate (serialization still applies).
- Add tests: a failed reassess records no receipt, and re-saving the same text then enqueues again; a successful reassess records the receipt, and re-saving the same text enqueues nothing.

ITEM 2: Seeker messages when nothing changed
Show exactly these messages, where the current save or click message is shown today, only when the gate skips because inputs are unchanged. Keep the existing messages when work actually runs.
- Saving an unchanged job posting: No Changes To Job Posting
- Saving unchanged "Missing relevant experience" background: No Changes To Your Background
- Clicking the Cheat Sheet regenerate control when the overview and person sections have nothing to rebuild: No Changes To Cheat Sheet
Report where each renders. If the Cheat Sheet regenerate control can rebuild person sections while the overview is unchanged, show "No Changes To Cheat Sheet" only when nothing at all would run.

TESTS
Add automated tests for both items: the receipt timing cases above, and each message appears exactly as written only on a skip, with the existing messages kept when work runs. Run the worker boundary test (--conditions=react-server) and confirm processApplicationJob still loads cleanly. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on branch checkpoint/harper-prep-hub with a message naming the Phase 2 batch 1 receipt timing and skip messages, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: where the receipt is now recorded, and how duplicates are prevented.
2. ITEM 2: where each message renders, and the Cheat Sheet rule.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that no git command discarded work and nothing outside these items changed.
