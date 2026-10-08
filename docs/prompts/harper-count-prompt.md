[BUILD + DEPLOY] Application Dashboard: correct Harper count, drop duplicate wording

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Display only. No change to step state rules. No paid calls, no schema changes, no instruction changes. Copy lives in the product config. Never silence type or lint errors.

NO STACKING, NO CONFLICTS
Fix the existing Harper count in the step model from feat/dashboard-guidance; do not add a second count. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/harper-count. If origin/main does not include fix/dashboard-compact, STOP and report. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the two items below. Change nothing else.

DEFECT (production, Sift application cmux4btmv0005p32prkebgtka)
The Harper Questionnaire card says "21 questions need your answer", but only two questions are still open; all others are approved.

ITEMS
1. Report exactly what the count included, with file and line. Fix it so it counts every Harper question that is unanswered or skipped (including one with a draft that is not yet approved), across all sections of the Harper page (Where you stand rows, Questions that need more information, and best-practice questions). Approved and permanently ignored questions are never counted.
2. Remove the Harper Questionnaire card's "Please review and respond" status text; the action button already says it.

TESTS
Choose the minimum relevant tests that prove unanswered, skipped, and unapproved-draft questions are counted and approved and ignored questions are not, and that the status text is gone. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
What the count included before, the fix, with file and line, the checks run and results, and main before and after.
