[BUILD + DEPLOY] Application Dashboard: whose turn, one action per card, "Your next step"

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Display only, for every kind of seeker. The rules that decide each step's state do not change; this reads them. No paid calls, no jobs enqueued, nothing generated on page view. No schema changes, no instruction changes. Reuse the existing live spinner and refresh. Copy lives in the product config. Never silence type or lint errors.

NO STACKING, NO CONFLICTS
Reuse the existing step-state logic (the same source the dashboard cards and the top-bar "Currently Completing / Next Up" pills use) and the existing card component. Do not add a second state calculation; add counts and action targets to the existing step model. Remove any card markup this replaces and tests that only cover it. Report any overlapping code. If a requested state or count cannot be shown without changing a step's state rule, do not change the rule: skip that part, report it, and continue.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named feat/dashboard-guidance. If origin/main does not include fix/dashboard-wording, STOP and report. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the three items below. Change nothing else.

ITEMS
1. Whose turn: each Application steps card shows one of these, from the existing step state:
   - "Harper is working": while that step's background work runs, with the existing spinner.
   - "Your turn": yellow, when the seeker needs to act, with a count where the data exists (for example "3 questions need your answer" on Harper Questionnaire, "2 interviewers have no prep guide" on Interview Preparation Guides). Keep the step's status wording from the wording change alongside.
   - "Done": green, as today (Interview Notes stays yellow as already set).
   Steps not started keep their current look.
2. One action button per card that goes straight to the task, not just the page: for example "Answer Harper's questions" opens the Harper page at the first question needing an answer; "Review your bullets" opens the resume picker; "Create prep guides" opens Interview Notes at the first interviewer without a guide; "Mark as applied" opens Application Status. Each step's label and exact target are listed in the report. A done step's button opens its page.
3. "Your next step": a line at the top of the Application Dashboard, "Your next step: {step name}: {action}", with that step's action button. It uses the same step the top-bar "Currently Completing" pill shows. When every step is done, it is hidden.

TESTS
Choose the minimum relevant tests that prove each item using the existing step states (a working step shows the spinner, a your-turn step shows its count and button, the next-step line matches the Currently Completing pill), and that viewing the dashboard makes no paid call and enqueues nothing. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
1. For each step: its states, the count shown (or why none), the button label, and the exact target, in one table, with file and line.
2. Anything skipped because it would need a state rule change.
3. Code and tests removed, any overlapping code, the checks run and results, and main before and after.
