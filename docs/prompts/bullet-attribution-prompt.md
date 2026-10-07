[BUILD, REPORT] Resume bullets: never attribute a result to the wrong employer

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix the root cause, for every kind of seeker. The instruction text below is approved exactly as written; no other instruction wording may change. Every paid call stays behind the paid-call gate. No schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/bullet-attribution. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the two items below. Do not merge or push main.

CONTEXT (production, Sift application cmux4btmv0005p32prkebgtka)
The bullet candidate call assigned results to the wrong roles: AT&T, NTT, Accenture, and IBM bullets (Micro Focus) appeared under Checkpoint Technologies; a "forecast deviation to 5–10% ... FY26" bullet (OpenText) appeared under Login VSI; a $15M+ quota team the seeker tied to Merion Publications appeared under Aerotek; and a $9.7M ARR increase the seeker tied to RAMP Advertising appeared under Merion Publications. When evidence does not name an employer, the model guesses.

ITEMS
1. Correct attribution: add exactly this text to the bullet candidate instruction, after "Assign each bullet to exactly one supplied Personal Profile role id.":
Assign a bullet to a role only when the evidence names that role's employer or is an achievement listed under that role in the Personal Profile. Evidence that names no employer is not assigned to any role.
Enforce it in code: each candidate carries the ids of the evidence it came from; a candidate is kept only when that evidence is an achievement listed under the assigned role, or its text names the assigned role's employer. Otherwise the candidate is dropped and logged. Report how evidence ids are carried and checked, with file and line.
2. Pick counter: the note under each role counts the bullets currently checked, including Harper's pre-checks, not only saved picks.
Bump the bullet candidate prompt version, and report what that triggers.

TESTS
Choose the minimum relevant tests that prove: a bullet from evidence naming one employer is never kept under another role; a profile achievement stays with its own role; evidence naming no employer is not assigned; the counter includes pre-checks. Use sales, nursing, and new-graduate fixtures. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

COMMIT
Commit on fix/bullet-attribution and push the branch. Do not merge or push main.

REPORT
1. Each item, with file and line, and how evidence ids are carried and checked.
2. The version bump and what it triggers.
3. The checks run and results, and the commit hash.
