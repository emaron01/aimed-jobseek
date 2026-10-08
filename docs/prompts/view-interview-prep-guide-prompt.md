[BUILD + DEPLOY] Interview Notes: "View Interview Prep Guide" button

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Navigation only. No paid calls, no schema changes, no instruction changes. Use the existing blue AppButton style. Copy lives in the product config. Never silence type or lint errors.

NO STACKING, NO CONFLICTS
Reuse the existing Cheat Sheet person lookup and section anchors (the "Find a person or Hiring Team role" selection and the person's CheatSheetSection) to open that person's guide; do not add a second way to select a person. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/view-prep-guide. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the item below. Change nothing else.

ITEM
On Interview Notes, beside each person's "Update Interview Prep Guide" button, add a blue button labeled exactly "View Interview Prep Guide", shown only when that person's guide exists. Clicking it opens the Interview Cheat Sheet with that person selected and scrolled to their section.

TESTS
Choose the minimum relevant tests that prove the button appears only when a guide exists and links to that person's section, plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
What changed, with file and line, the link used, the checks run and results, and main before and after.
