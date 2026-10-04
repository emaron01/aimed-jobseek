Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.
PRODUCTION STANDARD
Small follow-up to a2359a8, then deploy. No AI instruction changes, no schema changes. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Work in the fix/best-practice-drafts worktree, on top of a2359a8. If anything unexpected happens, STOP and report.
SURGICAL RULE
Change only the first-pass check below. Change nothing else.
ITEM
In bestPracticePassingDraft (src/lib/consultation/role-expertise.ts), a point-of-view answer (per askHarperAnswerKind) passes on the first attempt when its composed text (challenge, action, and result, as the fallback now composes it) is usable: no framework labels, not empty, and at least four words. Story answers keep the existing CAR or STAR and outcome checks. The fallback stays as in a2359a8.
TESTS
Choose the minimum relevant tests that prove a point-of-view answer whose content sits in the result part passes on the first attempt (one answers call, no retry), and that story answers still use the existing checks. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report.
DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.
REPORT
The change, the checks run and results, and main before and after.
