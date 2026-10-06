[BUILD, REPORT] Harper: why-this-company answers stay with their own application

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix the root cause. No AI instruction changes unless reported and approved first (exact current and proposed text, then STOP on that part). No schema changes or data repair. Every paid call stays behind the paid-call gate. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/why-company-scope. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the defect below. Do not merge or push main.

DEFECT (production)
On a new application for Sift, Harper's assessment said: "The profile contains a stated reason for joining CSC, but it does not establish a reason for wanting Sift, its fraud-prevention mission, or this enterprise sales leadership role." The seeker's why-this-company answer from the CSC application (cmuna46te0019r52o11wi0zm0) is reaching another application as Personal Profile evidence. Earlier planning output on another application also cited a fact id why-this-company:cmuna46te0019r52o11wi0zm0.
1. Report every path by which one application's why-this-company answer or Campaign.whyThisCompany reaches another application (Personal Profile items, seeker-stated facts, approved answers, the library, or anything else), with file and line.
2. Fix at the root: a why-this-company answer is evidence only for its own application. It never appears in any other application's Personal Profile items, planning, drafting, or library. Each application's why-this-company target is assessed only from that application's own answer.

TESTS
Choose the minimum relevant tests that prove one application's why-this-company answer never reaches another application's planning or drafting inputs, and its own application still uses it. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

COMMIT
Commit on fix/why-company-scope and push the branch. Do not merge or push main.

REPORT
1. Every leak path found, with file and line, and the fix.
2. Any instruction change proposed (or STOP), with exact text.
3. The checks you ran and results, and the commit hash.
