Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. Complete Batch B3 exactly as specified in its saved prompt; no temporary fixes, no data repair. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main (merge, not reset or rebase). If anything unexpected happens, STOP and report.
SURGICAL RULE
Resume and finish account lifecycle Batch B3 (read-only) only. Its full specification is the saved B3 prompt in docs/prompts/ (the account lifecycle B3 read-only prompt, including the approved readOnlyStartedAt migration, decisions 1 to 8, the exact seeker wording, the implementation list, TESTS, COMMIT, and REPORT). Follow it exactly. Change nothing outside B3. Add no features.
STEP 1: RECOVER THE STATE
1. On checkpoint/harper-prep-hub, run git status and git stash list. Report every modified, added, and untracked file, and any stash entries.
2. If B3 work is in a stash rather than the working tree, restore it with git stash apply (not pop, not drop), and report the result. If applying conflicts, STOP and report.
3. Confirm which parts of B3 are already done and which remain, against the saved B3 prompt (migration, guard extension, billing transitions, route redirect replacement and banner, exact messages, typed error handling, tests). The last known step was fixing invoice subscription ID extraction for the current Stripe types, then adding the B3 tests.
4. Merge origin/main into checkpoint/harper-prep-hub (it now includes the terms fix) and resolve nothing destructively; if there is a conflict, STOP and report.
STEP 2: FINISH B3
Complete every remaining part of the saved B3 prompt, including the invoice subscription ID extraction for the current Stripe types, and all B3 tests.
TESTS
All tests in the saved B3 prompt. Run the worker boundary test (--conditions=react-server) and confirm processApplicationJob still loads cleanly. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, commit on checkpoint/harper-prep-hub with a message naming account lifecycle B3 (read-only), and push that branch. Do not merge into main or push main. Once committed, the stash entry used (if any) may be left in place; do not drop it.
REPORT
1. STEP 1 findings: what was recovered, what was already done, what remained.
2. Everything in the saved B3 prompt's REPORT section (migration SQL, guard and writable check, billing transitions, actions and jobs covered and exemptions, where each message renders, files changed, tests, commit hash).
3. Confirmation that no git command discarded work and nothing outside B3 changed.
