Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Find and fix the root cause; no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the terms of service acceptance loop. Change nothing else. Add no features. If B3 is in progress on checkpoint/harper-prep-hub, do this fix on a separate branch from main named fix/eula-accept-loop so it can deploy on its own.

DEFECT
In production at https://www.myaimedjobseeker.com, a new account shows the terms of service page. After the seeker accepts, the page reloads to the terms of service page again. The acceptance does not take effect and the seeker never reaches their account. The app's APP_URL, NEXT_PUBLIC_APP_URL, and Better Auth URL were just changed from https://aimed-jobseek.onrender.com to https://www.myaimedjobseeker.com, with a new auth secret. The account was set up after a Super Admin deleted the previous workspace (the Super Admin user was kept), and an organization invitation was sent before signup.

LOGS (from Render, around signup and clicking Accept; no error was logged at the moment Accept was clicked):
[transactional-email] { provider: 'smtp', templateKey: 'ORGANIZATION_INVITATION', status: 'SENT', retryCount: 0, durationMs: 952, isTestSend: false }
2026-09-29T21:27:20.057Z WARN [Better Auth]: User not found
[transactional-email] { provider: 'smtp', templateKey: 'EMAIL_VERIFICATION', status: 'SENT', retryCount: 0, durationMs: 781, isTestSend: false }
[transactional-email] { provider: 'smtp', templateKey: 'WELCOME', status: 'SENT', retryCount: 0, durationMs: 709, isTestSend: false }

INVESTIGATE (report each with file and line)
1. The full path: the accept action, what it writes (UserEulaAcceptance or equivalent, keyed to which user and which EulaVersion), the redirect after accepting, and the check that decides whether to show the terms page again (which user, which version, which workspace).
2. Whether the accept Server Action can be silently rejected on the new domain: Next.js Server Actions origin checks, any serverActions allowedOrigins configuration, trusted origins, or anything else that still lists only the onrender.com address. Note that no error was logged at the moment of clicking Accept.
3. Whether the redirect after accepting uses a hard-coded or environment URL that points to the old address or loops back to the terms page.
4. Whether any write check, payment-lock gate, or the spend guard (assertOrganizationMaySpend, the server-action write check, enforcePaymentLockGate) blocks the acceptance or the next page, and whether /onboarding/eula and the accept action are exempt as intended.
5. Whether the check compares against the right EULA version (for example a missing or mismatched active EulaVersion), or the right user.
6. The "[Better Auth]: User not found" warning: what produces it, and whether the invitation-then-signup flow (an organization invitation sent before the account existed, followed by signup and email verification) creates the session, user, or membership in a way that makes the acceptance be written for one user or workspace and read for another. Include the case where the Super Admin user from the deleted workspace still exists.
7. Whether session cookies or the new auth secret cause the acceptance to be written for one session and read for another.

FIX
Fix the root cause found. If the cause is configuration only (an environment variable in Render), make no code change and state exactly what the product owner must set. If more than one cause contributes, fix each at the root.

TESTS
Add automated tests that assert: accepting the terms records the acceptance for the signed-in user and the active version; after accepting, the seeker is taken to their account and is not shown the terms again; the accept action works when the app URL is the custom domain; the acceptance works for an account created through an organization invitation followed by signup and email verification; and it works for a new workspace created by a user whose previous workspace was deleted. Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on the branch named above with a message naming the terms acceptance loop fix, and push that branch. Do not merge into main or push main.

REPORT
1. The root cause, with file and line, and the evidence (including the logs).
2. The fix, or the exact configuration the product owner must set.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that no git command discarded work and nothing outside this fix changed.
