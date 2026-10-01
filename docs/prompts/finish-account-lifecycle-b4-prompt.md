Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Reuse the shared B1 wipe (wipeOrganizationAccount); fix at the root; no temporary fixes, no data repair, no migrations, no schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, rebase, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1. If anything unexpected happens, STOP and report.

SURGICAL RULE
Finish account lifecycle B4 (self-serve Delete my account) only, per the B4 prompts already saved in docs/prompts/. Change nothing else. Add no features.

STEP 1: SAVE THE EXISTING B4 WORK (no discard)
1. In C:/Repos/aimed-jobseek on checkpoint/harper-prep-hub (at 9c995bd), report git status: every modified, added, and untracked file.
2. Commit the uncommitted B4 work as it stands (moving Delete my account from the account menu to the bottom of the Account settings page: DeleteMyAccountPanel, the account settings page, UserMenu and user-menu changes, tests, and the B4 prompt files) with a message naming B4 Delete moved to Account settings, work in progress. Push checkpoint/harper-prep-hub. Report the commit hash. Do not include files unrelated to B4; list any you leave uncommitted and why.

STEP 2: CARRY B4 ONTO TODAY'S MAIN
1. Run git fetch. Create a new worktree at C:/Repos/aimed-jobseek-b4-finish with a new branch from origin/main named fix/b4-delete-account.
2. Cherry-pick 9c995bd (B4 self-serve delete) and the STEP 1 commit onto it, in order. Resolve any conflicts so both main's current behavior and B4's intent are kept; report every conflict and how it was resolved. If a conflict cannot be resolved with confidence, STOP and report.

STEP 3: FINISH B4
1. Delete my account lives only at the bottom of the Account settings page, shown only to the owner of the active organization, with the B4 confirmation: the exact text "This permanently deletes your account and everything in it: your profile, applications, Harper coaching, cheat sheets, resumes, and messages. This can't be undone.", the DELETE field, the "Permanently delete my account" button disabled until DELETE is typed, and cancel. Same server action, server-side owner check, shared wipe with reason self_serve, sign-out, and landing on the sign-in page with exactly "Your account has been permanently deleted." The account menu dropdown is Account settings, Organization Settings, Support, and Log Out, with no delete item.
2. Restore the layout-level read-only block on server actions that B4 removed in payment-lock-gate.ts, with the exempt paths: billing, payment, credits, support, Account settings (password change and Delete my account), the terms page, and Log Out. Keep the requireOrganization → assertOrganizationWritable check as well; both layers stay. Report how Log Out is exempt.
3. Delete failure message, exactly: We couldn't delete your account. Nothing was deleted. Please contact support.
   with "contact support" linking to the existing support page (no raw path text).
4. REPORT ONLY (no changes): list every server action under src/app/actions/ and any other "use server" module, whether it changes data, which organization or auth helper it uses, whether that path calls the writable check, and flag any data-changing action that relies only on the layout block. Include actions added since B3 (Harper, Cheat Sheet, outreach mark-sent, likely-question refresh, and so on).

TESTS
Add or update automated tests that assert:
- The account menu shows no Delete item; the Account settings page shows the Delete section for the owner and not for a non-owner member.
- The confirmation text, DELETE gate, cancel, owner-only server check (including a direct call by a non-owner), shared wipe with reason self_serve, sign-out, and the exact landing message.
- Delete works from Account settings while the account is read-only; Log Out works while read-only.
- A data-changing server action on a non-exempt page is blocked while read-only by the restored layout block.
- A refused or failed wipe deletes nothing, keeps the seeker signed in, and shows the exact failure message with a working support link.
- Free and comped accounts are never read-only.
Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, plus the exact production build, the full type check, and lint. All must pass with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/b4-delete-account with a message naming account lifecycle B4 finished, and push that branch. Do not merge into main or push main.

REPORT
1. STEP 1: the files committed, any left uncommitted and why, and the commit hash.
2. STEP 2: the cherry-picks, every conflict, and how each was resolved.
3. STEP 3: each item, with file and line, and how Log Out is exempt.
4. The server action audit table and any flagged actions.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash, branch, and worktree path.
8. Confirmation that the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 were not touched, nothing was force-pushed, and no work was discarded.
