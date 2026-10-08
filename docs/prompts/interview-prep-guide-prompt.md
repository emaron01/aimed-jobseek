[BUILD, REPORT] Interview prep: "Create Interview Prep Guide" from Interview Notes and the Cheat Sheet, and fix the Cheat Sheet failure

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
For every kind of seeker. Every paid call stays behind the paid-call gate, runs only when the seeker clicks the button, never on page view or when an interviewer is added, and never pays twice for unchanged inputs (a persona already fully built for this application is reused). No instruction wording changes unless reported and approved first (exact proposed text, then STOP on that part). No schema changes unless reported and approved first. Reuse the existing live spinner and refresh. Copy lives in the product config. Never silence type or lint errors.

NO STACKING, NO CONFLICTS
Before writing code, find every existing path for persona builds (full build, "Generate persona research"), interviewer prep, the interviewer guide, the Interview Cheat Sheet generation and its "Find a person or Hiring Team role" lookup, and Cheat Sheet persona and interviewer sections, including any removed or hidden interviewer-prep code. Reuse them; both buttons call the same single path. Remove code this replaces and tests that only cover it. Report any overlapping or conflicting code or Harper instruction text; do not change instruction text.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named feat/interview-prep-guide. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below. Do not merge or push main.

DEFECT (production, Sift application cmux4btmv0005p32prkebgtka)
On the Interview Cheat Sheet, the seeker looked up a contact (Ashley Cobb, Sales Recruiter) and triggered generation. The page shows "Interview cheat sheet could not be generated. Retry." three times (a yellow banner, a red banner, and red text) above a "Retry cheat sheet" button. The seeker suspects the persona for that person was not fully built first. Find the actual cause, with file and line, and read-only SQL (UsageEvent steps and job errors for this application) that confirms it.

ITEMS
1. One path: a button labeled exactly "Create Interview Prep Guide" for a specific person, on each interviewer in Interview Notes and on the Interview Cheat Sheet after the seeker looks up a person. Both call one path that (a) finds the persona that fits this person for this application and runs its full build if it is not already fully built, then (b) builds that person's interview prep guide using that persona, the person's details, the job, company research, and the seeker's approved answers. After a guide exists, the button reads "Update Interview Prep Guide" and runs only if its inputs changed.
2. Fix the reported failure at its root cause.
3. One message: when generation fails, show a single plain message once, with one Retry button.
Show the existing live spinner while it runs, and the guide when done on the Interview Cheat Sheet in that person's section (report where interviewer prep is shown today and reuse it).

TESTS
Choose the minimum relevant tests that prove: no paid call when an interviewer is added or a page is viewed; either button runs the persona full build only when needed, then the guide; a second click with unchanged inputs pays nothing; the reported failure case now succeeds; a failure shows one message. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

COMMIT
Commit on feat/interview-prep-guide and push the branch. Do not merge or push main.

REPORT
1. The cause of the reported failure, with file and line, and the read-only SQL.
2. Existing paths found and reused (including removed interviewer-prep code), and code and tests removed.
3. What changed, with file and line, and where the guide is shown.
4. How the persona is matched to the person.
5. The paid calls per click and their cost.
6. Any overlapping or conflicting Harper instruction text, quoted with file and line, or "none".
7. The checks run and results, and the commit hash.
