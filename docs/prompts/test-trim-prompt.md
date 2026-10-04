Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Test cleanup only: no application code changes. The suite has grown to about 2,400 tests in about 330 files over a month, with tests stacked on every change and rarely retired. Keep only tests that protect real behavior or a real risk; remove the rest. You decide what to remove under the rules below; the product owner will not review individual tests. Never weaken a kept test (no loosened assertions, no raised timeouts as a fix). Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do NOT use C:/Repos/aimed-jobseek. Do not touch any other branch or worktree. Run git fetch, then create a new worktree and a new branch from origin/main named chore/test-trim. If anything unexpected happens, STOP and report.

SURGICAL RULE
Remove or trim tests only, under the rules below, plus any test helper or fixture file that becomes unused. Change nothing else.

PROTECTED AREAS (must keep at least one behavior test each)
Paid-call gate and receipts (never paying twice for the same input); no AI calls or enqueued jobs on page views; the spend guard and payment lock; model overrides; account deletion and wipe; organization data isolation; deletes removing only what they should; Harper's planning split (terra decides, luna writes, luna cannot change questions or strengths); Harper replies (including replying to skipped questions), approvals, the library, best-practice questions and their recovery, and Ask Harper; research company anchoring, source filtering, and unsourced-specific removal; background job serialization, no double-runs, and stale-job recovery; sign-in and the EULA flow.

REMOVAL RULES
1. DEAD: remove tests for removed, hidden, or replaced features (for example Aimed Outreach scoring, ICPs, the Microsoft mailbox, the old interview stage layout, Open stage, automatic interviewer prep on add, Harper's interviewer sections, per-step side navigation, and anything else no longer in the product).
2. BRITTLE: remove tests that only assert exact wording, labels, CSS classes, version numbers, or that source code contains certain text, where the wording itself is not the risk. If such a test is the only coverage of a protected area, keep it.
3. REDUNDANT: remove a test when another kept test covers the same behavior; name the covering test in the report.
4. Never remove the last behavior test covering a protected area.
5. Keep tests that prove a real behavior or guard a real risk, even if outside the protected areas.

TESTS
Run npx tsc --noEmit and lint once. Then run, once, only the kept test files covering the protected areas (list them). If any fail, re-run only the failed files once; if they pass on their own, treat them as flaky and note them; if they fail again, STOP and report. Do not run the full suite.

DEPLOY (only if every check above passes)
1. Commit on chore/test-trim with a message naming the test cleanup, and push the branch.
2. Run git fetch. If origin/main has moved, merge it in (merge, not rebase); if there is any conflict, STOP and report; after a clean merge, run only npx tsc --noEmit.
3. Fast-forward origin/main to the branch tip by pushing it to main (fast-forward only; never force). If a fast-forward is not possible, STOP and report.

REPORT
1. Totals before and after: test files, tests, and the estimated full-suite run time.
2. Removed counts by rule (DEAD, BRITTLE, REDUNDANT), with each removed file or test and, for REDUNDANT, the covering test.
3. Each protected area and the kept tests covering it; confirm none is uncovered.
4. Each check's command, exit code, and result, and any flaky files.
5. main before and after, and confirmation the push was a fast-forward (or that nothing was merged, and why).
