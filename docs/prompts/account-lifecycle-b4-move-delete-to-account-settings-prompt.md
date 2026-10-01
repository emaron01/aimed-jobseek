Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. If anything unexpected happens, STOP and report.

SURGICAL RULE
Correct only the items below in account lifecycle B4 (commit 9c995bd on checkpoint/harper-prep-hub). Change nothing else. Add no features.

ITEM 1: Move "Delete my account" to Account settings
- Remove the "Delete my account" item from the account menu dropdown. The dropdown returns to Account settings, Organization Settings, Support, and Log Out.
- Add a "Delete my account" section at the bottom of the Account settings page (src/app/(app)/settings/account/page.tsx), shown only to the owner of the active organization, with a button that opens the same confirmation as B4: the exact text "This permanently deletes your account and everything in it: your profile, applications, Harper coaching, cheat sheets, resumes, and messages. This can't be undone.", the DELETE field, the "Permanently delete my account" button disabled until DELETE
