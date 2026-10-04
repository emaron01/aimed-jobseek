Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Restore the reverted research cleanup 2 (b6e2a9b) without its uncited-specifics filter. No other changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/research-cleanup-2-restore. If anything unexpected happens, STOP and report.

SURGICAL RULE
1. Revert the revert commit 7683814 (git revert 7683814), which restores b6e2a9b. If there is a conflict, STOP and report.
2. Remove only item 5 (the uncited-specifics filter: sentenceHasUnsupportedSpecific and its use in cleanResearchProse, before save and at display), so uncited sentences are kept as they were before b6e2a9b. Keep items 1 to 4 (clean citations, company website labels, key pages including leadership via the About page, employer risk filtering) and the version bump.
Change nothing else.

TESTS
Choose the minimum relevant research tests that prove items 1 to 4 still work and that an uncited sentence naming a company, number, or date is now kept. Update or remove any test that asserted the removed filter. Plus the type check. Do not run the full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, then fast-forward origin/main to it (merge origin/main first if it moved; STOP on any conflict). Never force.

REPORT
What was restored and removed, the checks run and results, and main before and after.
