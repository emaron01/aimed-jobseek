[BUILD + DEPLOY] Resume picker: "Leave off resume" per application

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
For every kind of seeker. No instruction wording changes, no paid calls. No schema changes: store the choice in the application's existing resume picks JSON (Campaign.resumeStatementPicksJson) beside picks and seen; if that is not possible, STOP and report before changing anything. Approved or earlier resume versions are never changed by this. Never silence type or lint errors.

NO STACKING, NO CONFLICTS
Reuse the existing "Leave off resume" switch, hiddenRoleIds on Generate, and the resume and DOCX filters. Remove the profile-level storage (profileJson.hiddenRoleIds) and its read and write paths once moved, and remove tests that only cover it. Report any overlapping code or Harper instruction text; do not change instruction text.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/hide-per-application. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the item below. Change nothing else.

ITEM
"Leave off resume" applies only to the application where the seeker set it. Each application stores its own hidden job ids; Generate for that application uses only its own list; other applications are unaffected; a new application starts with no hidden jobs. Carry over the existing profile-level hidden ids once to every application that has a resume picker state, so nothing the seeker already hid reappears, then clear the profile field.

TESTS
Choose the minimum relevant tests that prove a job hidden on one application is absent from that application's resume and present on another's, and that existing hides carry over. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
What changed, with file and line, how existing hides were carried over, code and tests removed, any overlapping code or instruction text, the checks run and results, and main before and after.
