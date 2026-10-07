[BUILD + DEPLOY] Resume picker: leave a job off, add your own bullet, no empty jobs

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
For every kind of seeker. No instruction wording changes. No paid calls added: none of these items calls a model. No schema changes: store choices in existing JSON beside the seeker's bullets and job corrections; if that is not possible, STOP and report before changing anything. Copy lives in the product config. Never silence type or lint errors.

NO STACKING, NO CONFLICTS
Before writing code, find every existing code path, stored field, and Harper instruction text that does the same job as or overlaps these items (for example an earlier hide-a-job feature, an earlier way to add bullets, or instruction sentences about which roles or bullets appear). Reuse what exists instead of adding a parallel path. Remove code that these items replace, and remove tests that only cover removed code. Do not add instruction text. If an existing Harper instruction conflicts with these items, do not change it: quote it in the report and STOP on that part.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/picker-jobs. If origin/main does not include fix/bullets-clean, STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the three items below. Change nothing else.

ITEMS
1. Leave a job off: each job group in the picker has a switch labeled exactly "Leave off resume". When on, that job is omitted from the resume entirely (not shown in Experience or Earlier experience), its bullets are not used, and the choice is remembered for the seeker. Reuse any earlier hide-a-job feature (for example hiddenRoleIds) if it exists.
2. Add a bullet: each job group has an "Add a bullet" control. The seeker types one line and saves; it becomes a seeker bullet in that job (the same permanent seeker bullet used for edits: picked by default, never rewritten, moved, or unpicked by Harper, reusable as seeker evidence, accepted by the citation check). Saving makes no paid call and keeps the seeker on that job.
3. No empty jobs: when a job that is on the resume and inside a bullet band has no candidates, seeker bullets, or picks, the picker offers that job's Personal Profile achievements word for word as bullets, recommended up to the band minimum. No model call.

TESTS
Choose the minimum relevant tests that prove each item, using sales, nursing, and new-graduate fixtures: a job left off is absent from the generated resume; an added bullet is stored as a seeker bullet, survives Refresh, and makes no paid call; a job with no candidates shows its profile achievements word for word. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass and no conflict STOP applies)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
1. What changed for each item, with file and line.
2. Existing paths found and reused, and code and tests removed.
3. Every Harper instruction sentence (resume writer, bullet candidates, presentation plan) that overlaps or conflicts with these items, quoted verbatim with file and line, or "none".
4. The checks run and results, and main before and after.
