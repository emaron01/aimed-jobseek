Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Reuse the shared B1 wipe (wipeOrganizationAccount); no second deletion path, no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.

SURGICAL RULE
Batch B4 only, per section 4 and batch B4 of docs/prompts/account-lifecycle-plan-report.md, with the product owner's decisions below. Build self-serve "Delete my account". Do not build the scheduled wipe (B5), remove the selective purge (B6), or change Stripe webhooks (B7). Change no other menu item. Add no features.

PRODUCT OWNER DECISIONS
1. Placement: "Delete my account" is a new item in the account menu (the dropdown with Account settings, Organization Settings, Support, and Log Out), in the same section as Support and Log Out.
2. Who: only the signed-in owner of the active organization can run it; a member who is not the owner does not see it and cannot run it. It wipes that organization using the shared B1 wipe with reason self_serve.
3. Read-only: it works while the account is read-only (exempt from the read-only write block, as billing is).
4. Confirmation: selecting it opens a confirmation showing exactly:
This permanently deletes your account and everything in it: your profile, applications, Harper coaching, cheat sheets, resumes, and messages. This can't be undone.
The seeker must type DELETE into a field; the button, labeled exactly "Permanently delete my account", stays disabled until the field contains DELETE. A cancel option closes it without changes.
5. After deletion: the seeker's session ends, and they land on the sign-in page showing exactly: Your account has been permanently deleted.
6. If the wipe refuses (for example a Stripe subscription exists but Stripe is not configured) or fails, nothing is deleted, the seeker stays signed in, and they see a clear error with the existing support path. Report the exact message used.

TESTS
Add automated tests that assert:
- The menu shows "Delete my account" in the Support and Log Out section for the owner, and not for a non-owner member.
- The confirmation shows the exact text; the button stays disabled until DELETE is typed; cancel changes nothing.
- The owner's confirmed delete runs the shared wipe with reason self_serve, ends the session, and lands on the sign-in page with the exact message; signing up again with the same email starts completely fresh.
- A non-owner cannot run the action directly (server-side check), even by calling the action.
- It works while the account is read-only.
- A refused or failed wipe deletes nothing and keeps the seeker signed in.
Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming account lifecycle B4 (self-serve delete), and push that branch. Do not merge into main or push main.

REPORT
1. Where the menu item and confirmation live, with file and line.
2. The server-side owner check and read-only exemption.
3. The session end and post-delete landing.
4. The refusal and failure behavior and message.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that no git command discarded work and nothing outside B4 changed.
