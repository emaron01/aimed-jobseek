[BUILD + DEPLOY] Harper: Edit on approved answers

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Restore editing of approved answers using the existing statement edit path. Editing makes no paid call and enqueues nothing. Copy lives in the product config. No schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/edit-approved. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the defect below. Change nothing else.

DEFECT (production)
On the Harper page, an approved interview answer (for example under "Scale talent through active coaching, joint customer calls, and structured performance management.") shows the answer and an "Approved" badge, but no Edit button, so the seeker cannot correct an approved answer. The "Approved" badge also appears twice on the card.
1. Report why approved cards lost Edit, with file and line.
2. Fix it: every approved answer card (Harper page, Interview Cheat Sheet, and anywhere the same card appears) shows an Edit button in its action row. Saving an edit keeps the answer approved with the new text, updates everything that reads the approved answer (the library, ProfileStory, resume evidence), and keeps the seeker on the card.
3. Show the "Approved" badge once per card.

TESTS
Choose the minimum relevant tests that prove an approved card shows Edit, an edit keeps it approved with the new text and makes no paid call, and the badge appears once. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
The cause and fix, with file and line, the checks run and results, and main before and after.
