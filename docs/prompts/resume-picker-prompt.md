[BUILD, REPORT] Resume: Harper Approved Statements picker by role, consistent output, citation check

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Per docs/prompts/resume-content-report.md (branch report/resume-content), with the product owner's decisions below, for every kind of seeker. Every paid call stays behind the paid-call gate; changing picks triggers nothing on its own (the seeker regenerates). No database schema changes unless reported and approved first: store picks in existing JSON if possible; if a schema change is needed, STOP and report it before changing anything. No data repair. Copy lives in the product config. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named feat/resume-picker. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the six items below. Do not merge or push main.

BULLET GUIDELINE (product owner)
The goal is enough evidence of impact, scope, and relevant skills without turning the resume into a job description. Bullets per role by how long ago the role ended, with relevance deciding where in the range a role falls:
- 0 to 5 years ago: 3 to 5 bullets (the most recent or most relevant role up to 7)
- 5 to 10 years ago: 1 to 3 bullets
- 10 to 15 years ago: 0 to 2 bullets
- 15 or more years ago: title, company, and dates only, unless directly relevant to the job

ITEMS
1. Picker: on the resume page, a section titled exactly "Harper Approved Statements" lists every approved interview answer and approved resume bullet available to this application (this application's approvals and the seeker's library), grouped by the Personal Profile role it belongs to (by the employer, school, or project it names), with each item tagged with the job requirement it covers when it answers a Where you stand requirement row. Items tied to no role go in a group titled exactly "Broader experience". Each item has a checkbox. Harper pre-checks a recommended set per role within that role's range from the bullet guideline, strongest requirement coverage first. Show each role's recommended range and a gentle note when a role's picks fall outside it; never block saving. Report where picks are stored.
2. Resume uses the picks: the resume writer receives the picked statements as required content and must use every pick in its role, then fills each role to its range from the Personal Profile's achievements and other approved evidence, following the bullet guideline, so the resume is full, not only requirement answers. Roles in the oldest band show title, company, and dates only unless directly relevant.
3. Presentation plan: stop using it to choose stories; keep it only for which older roles to condense and for judging each role's relevance to the job.
4. Consistent output: write the resume at temperature 0, so the same picks and profile give the same resume.
5. Citation check: put validateAssetContent back on the save path, so a resume claim that cites no real source (Personal Profile fact, approved statement, or approved story) is not saved as written; use the existing one-retry path with that feedback, and report what happens when the retry still fails.
6. Super Admin: add the bullet guideline's bands (year boundaries and bullet ranges, including the most recent or relevant role maximum) to the existing Harper settings page, with the defaults above.
Bump the affected prompt versions, and report what each bump triggers.

TESTS
Choose the minimum relevant tests that prove each item, using a sales, a nursing, and a new-graduate fixture: the picker groups by role, tags requirements, puts unattached items in Broader experience, and pre-checks within each role's range; every pick appears in the resume input as required content for its role; a role ended 15 or more years ago gets title, company, and dates only unless relevant; the plan no longer selects stories; temperature is 0 for the resume call; an uncited claim triggers the retry; the Super Admin bands change the recommendations. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

COMMIT
Commit on feat/resume-picker and push the branch. Do not merge or push main.

REPORT
1. Each item, with file and line, and where picks are stored.
2. The version bumps and what they trigger.
3. The checks run and results, and the commit hash.
