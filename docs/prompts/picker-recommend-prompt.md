[BUILD + DEPLOY] Resume picker: Harper's recommendations visible, per-bullet job correction, no duplicates, older roles offered, no lost results

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fixes to the deployed resume picker, for every kind of seeker. The seeker's library of approved answers is the primary evidence; nothing is forced. No instruction wording changes unless reported and approved first (exact proposed text, then STOP on that part). Every paid call stays behind the paid-call gate and never runs on page view; a job correction makes no paid call. Copy lives in the product config. No schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/picker-recommend. If origin/main does not include fix/bullet-library, STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the six items below. Change nothing else.

CONTEXT (production, Sift application cmux4btmv0005p32prkebgtka)
After the seeker saved picks, Harper's recommendations are no longer visible, and new candidates from a refresh arrive unchecked. VMware appears twice under OpenText, and a Bank of America bullet appears under OpenText and in General background. Two bullets from one approved answer (an OpenText team at 90%–110% of goal, and a Sprint sale at Gryphon Networks) sit under Gryphon Networks; changing the job selector on one moves both, because the correction is stored on the shared evidence. The seeker's answer used "OT" for OpenText. RAMP Advertising and Checkpoint Technologies show no candidates at all, though the seeker's resume has bullets for them. The AT&T result (a $100K SIEM sale grown to $1MM in utilization and a $6MM network operations management sale, Micro Focus), offered in earlier runs, no longer appears.

ITEMS
1. Harper recommends: show a small "Harper recommends" badge on Harper's recommended bullets in each group, always visible and separate from the seeker's checkboxes. Bullets new since the seeker's last save are pre-checked when Harper recommends them; the seeker's existing choices are kept.
2. Per-bullet job correction: a job correction applies only to the bullet it was made on, and is remembered on later runs for the bullet carrying the same result from the same evidence. Other bullets from the same evidence are not moved. Report how a bullet is matched across runs, with file and line.
3. No duplicates: near-identical bullets (the same result from the same or overlapping evidence) appear once, in the right group, never under a role and in General background at once.
4. Short forms: employer matching recognizes common short forms and initials of a profile employer (for example "OT" for OpenText) when they match exactly one profile employer.
5. Older roles offered: roles 15 or more years ago still get candidates from their evidence; they are offered unchecked and never recommended unless directly relevant. The resume still shows title, company, and dates only for them unless the seeker picks a bullet.
6. No lost results: report why the AT&T result above stopped appearing (which step dropped or merged it, with file and line), and fix the root cause so a distinct stated result is never dropped by deduplication, merging, or attribution.

TESTS
Choose the minimum relevant tests that prove each item, using sales, nursing, and new-graduate fixtures. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
What changed for each item, with file and line, the AT&T root cause, how bullets are matched across runs, the checks run and results, and main before and after.
