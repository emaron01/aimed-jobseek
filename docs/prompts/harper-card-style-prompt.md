[BUILD + DEPLOY] Harper: white cards, thicker card border, one row of buttons

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
UI only. Copy lives in the product config. Use existing design tokens (white surface, an existing stronger border token); no new colors. No behavior changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/harper-card-style. If origin/main does not include Batch C (fix/harper-spec-batch-c), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the three items below. Change nothing else.

ITEMS
1. Every outer card on the Harper page (each requirement card in Where you stand, and each question card in the other sections) has a white background, so cards stand apart from the page background.
2. The outer card border is thicker than today. Borders inside a card (the inner question box and similar) stay thin.
3. One row of buttons: Skip and Ignore sit in the same horizontal row as the other card buttons (Save Answer, Approve, Regenerate, Edit), wrapping only on narrow screens. Rename "Ignore" to exactly "Permanently Ignore". Behavior unchanged. Apply the same to the Cheat Sheet cards that use these controls.

TESTS
Choose the minimum relevant tests that prove all three, plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
What changed, with file and line, the checks run and results, and main before and after.
