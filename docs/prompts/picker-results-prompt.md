[BUILD + DEPLOY] Resume picker: one bullet per result, every stated number covered

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fixes to the deployed resume picker, for every kind of seeker. No instruction wording changes. Every paid call stays behind the paid-call gate and never runs on page view. No schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/picker-results. If origin/main does not include fix/picker-recommend, STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the two items below. Change nothing else.

CONTEXT (production, Sift application cmux4btmv0005p32prkebgtka)
Under OpenText, Harper recommends two bullets for the same $6.8MM FY26 result ("Drove GSI and end-customer motions..." and "Generated $6.8MM in FY26 revenue...") and two for the same $1.3MM contract with about $300K upsell ("Led a risk-driven enterprise sale..." and "Led executive-level deal strategy..."), because they come from different approved answers and collapseSameResults requires overlapping evidence. The AT&T result (a $100K SIEM sale grown to $1MM in utilization and a $6MM network operations management sale, Micro Focus) is still never offered: the coverage follow-up treats its evidence as covered because another bullet ("Sold ... to strategic accounts including AT&T, NTT, Accenture, and IBM") cites the same evidence without those numbers.

ITEMS
1. One bullet per result: bullets in the same group that state the same result (the same amounts and named customers, by the existing sameBulletResult rule) collapse to one even when their evidence does not overlap, keeping the one with more amounts, then the one Harper ranks higher. Harper never recommends two bullets for the same result. Bullets with different amounts for the same named customer are both kept.
2. Every stated number covered: the coverage follow-up treats an evidence item as covered only when every amount it states (each number with a unit or currency) appears in at least one bullet; otherwise that evidence goes into the single existing follow-up call.
Report the AT&T outcome on a dry run against the stored evidence shape.

TESTS
Choose the minimum relevant tests that prove both items, using sales, nursing, and new-graduate fixtures: two bullets from different evidence stating the same result collapse to one; evidence whose numbers appear in no bullet triggers the follow-up even when another bullet cites it. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
What changed for each item, with file and line, the AT&T outcome, the checks run and results, and main before and after.
