[BUILD + DEPLOY] Harper: answered items stay put, and edit any draft

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Layout and editing only. Reuse the existing inline edit used for approved answers. Editing a draft makes no paid call and enqueues nothing. Copy lives in the product config. No schema changes unless reported and approved first. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/harper-drafts-ux. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the two items below. Approve and Regenerate keep their behavior. Change nothing else.

ITEMS
1. Answered items stay put: on the Harper page, the seeker answered "Why you want to work at this company" from the "Where you stand" section (the "Add anything you have about this gap" box). After saving, the item moved to the bottom of "Questions that need more information"; after approval, it moved back to "Where you stand". Find the root cause, with file and line, and fix it so every item answered from "Where you stand" stays there through saving, drafting, and approval, showing its draft and controls in place, with no page jump. Items answered from "Questions that need more information" keep their current behavior.
2. Edit any draft: every Harper draft (gap questions, best-practice questions, items answered from "Where you stand", and Ask Harper) gets an "Edit" button in the same horizontal row as Approve and Regenerate, beside them, never below them. Edit opens the draft text in place; Save keeps the edited text as the draft (still a Draft, with Approve, Regenerate, and Edit in one row); Approve then approves the edited text exactly as written. Editing never calls a model. Report where the edited text is stored, with file and line.

TESTS
Choose the minimum relevant tests that prove both items (an item answered from "Where you stand" stays there through approval; Edit is in the same row; an edit makes no paid call, is kept as the draft, and is approved exactly). Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
1. Item 1's root cause and fix, and item 2's changes and where edits are stored, with file and line.
2. The checks run and results, and main before and after.
