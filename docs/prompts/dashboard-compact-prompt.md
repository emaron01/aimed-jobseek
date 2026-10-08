[BUILD + DEPLOY] Application Dashboard: compact cards, action buttons on the right

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Layout and button style only. No change to step states, counts, labels, or targets. No paid calls, no schema changes, no instruction changes. Use existing design tokens and button variants (the existing green success variant and the existing white secondary variant, in their small size); no new colors. Never silence type or lint errors.

NO STACKING, NO CONFLICTS
Change the existing Application steps card and "Your next step" markup from feat/dashboard-guidance in place; do not add a second card layout. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/dashboard-compact. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below. Change nothing else.

ITEMS
1. On each Application steps card, put the action button on the same row as the card's text, aligned to the right and vertically centered, so the card takes no extra height for the button. On narrow screens it may wrap below the text.
2. Use the small button size.
3. Button color: green (success variant) when the step needs the seeker to act ("Your turn"); white (secondary variant) when the step is done or while Harper is working.
4. Apply the same layout and color rule to the "Your next step" line's button.

TESTS
Choose the minimum relevant tests that prove the button renders in the card's text row, uses the small size, and is green for a your-turn step and white for a done step. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
What changed, with file and line, the checks run and results, and main before and after.
