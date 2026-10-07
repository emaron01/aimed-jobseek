[BUILD + DEPLOY] Resume and picker: correct date order for every date format

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix the root cause, for every kind of seeker and every date format a seeker may type. Ordering only: no change to content, prompts, or what is stored. No schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/role-date-order. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the defect below. Change nothing else.

DEFECT (production, Sift application cmux4btmv0005p32prkebgtka)
The resume and the picker list roles in this order: OpenText (Dec 2022 – Present), Checkpoint Technologies (2014 – 2015), Gryphon Networks (2010 – 2014), RAMP Advertising (2006 – 2010), Merion Publications (2002 – 2006), Marketing Database Associates (1997 – 2002), Aerotek (1994 – 1996), then Login VSI (December 2021 – Dec 2022) and Micro Focus (Apr 2015 – Dec 2021) last. The two roles placed last are the only ones whose dates use month names, so orderRolesMostRecentFirst most likely fails to parse them and treats them as undated.
1. Confirm the cause, with file and line.
2. Fix the date reading so every common format sorts correctly: year only (2014), month name or abbreviation and year (Dec 2022, December 2021, Sept 2019), numeric month and year (2021-03, 03/2021, 3/2021), and Present, Current, or Now as the most recent. A role is undated only when no year can be read at all.
3. The resume download, the resume writer input, and the picker all use the same order.

TESTS
Choose the minimum relevant tests that prove the reported profile sorts as OpenText, Login VSI, Micro Focus, Checkpoint, Gryphon, RAMP, Merion, Marketing Database Associates, Aerotek, and that each listed format parses, plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
The cause and fix, with file and line, the checks run and results, and main before and after.
