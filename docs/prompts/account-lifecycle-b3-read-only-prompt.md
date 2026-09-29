Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. One shared read-only decision in the B2 spend guard; no per-page UI hiding as enforcement, no temporary fixes, no data repair. One additive schema change is approved (below). Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.

SURGICAL RULE
Batch B3 only, per sections 5, 6, and 8 and batch B3 of docs/prompts/account-lifecycle-plan-report.md, with the product owner's decisions below. Build the read-only state and cancel-at-period-end. Do not build self-serve delete (B4), the scheduled wipe (B5), remove the selective purge (B6), or change Stripe webhook handling beyond what B3 needs (B7). Add no features.

APPROVED SCHEMA CHANGE
Add a nullable OrganizationBillingProfile.readOnlyStartedAt (DateTime?) in one migration. Existing rows stay null (not read-only). No backfill. Keep the existing CANCELED billing status (no enum change).

PRODUCT OWNER DECISIONS
1. Service continues through the end of the paid period; there is no proration. When a paid period ends without a successful payment (the seeker cancelled, or a card was declined and not paid), the account becomes read-only and readOnlyStartedAt is set.
2. Self-serve cancel sets cancel-at-period-end (the seeker keeps full access until the period ends) instead of cancelling immediately. Immediate cancellation stays only for the full wipe and comped conversion.
3. Read-only: the seeker can open and view every page. They cannot create or change anything, and no paid AI call or job can run. Enforce this through the single B2 guard (assertOrganizationMaySpend and its writable counterpart) and the existing server-action write check, not by hiding UI. Replace today's route redirects for cancelled and past-due accounts with read-only viewing.
4. Allowed while read-only: viewing every page, billing, payment, resubscription, support requests, password change, and logout. Everything else is blocked, including email digest settings.
5. Paying or resubscribing within 30 days restores full access with all data and clears readOnlyStartedAt.
6. FREE and COMPED accounts never become read-only.
7. Replace today's 14-day past-due grace followed by a lock with this model.
8. Seeker wording, exactly:
   - Read-only banner on every page: Your subscription has ended, so your account is read-only. Renew within 30 days to keep everything. After that, your account and data are permanently deleted.
   - Billing page when cancellation is scheduled: Your subscription ends on {date}. You'll keep full access until then. ({date} is the period end date, formatted as the app formats dates elsewhere.)
   - When a blocked action is attempted: Your account is read-only. Renew your subscription to make changes.
   Every action refused for read-only shows that exact message, not a generic error (including actions that today only catch TenantError).

IMPLEMENT
1. The migration for readOnlyStartedAt.
2. Extend the B2 guard with read-only (single place), and a writable check for non-paid writes, used by the existing server-action write path.
3. Billing state transitions per decisions 1, 2, 5, 6, and 7, including how they are set before Stripe is live, and the Stripe events that will set them once live (customer.subscription.updated with cancel_at_period_end, customer.subscription.deleted, invoice payment failure at renewal, successful payment and checkout).
4. Replace the route redirects with read-only viewing and the banner; keep the allowed list in decision 4.
5. The exact messages in decision 8, including typed-error handling in actions.
Report every action and job the read-only check covers, and every allowed exemption.

TESTS
Add automated tests that assert:
- Cancelling sets cancel-at-period-end and keeps full access until the period ends; at period end the account becomes read-only with readOnlyStartedAt set.
- A renewal payment failure at the end of the period makes the account read-only.
- A read-only account can open every main page (applications, Harper, Cheat Sheet, Stage, Outreach, settings) and sees the banner text exactly.
- A read-only account cannot create or change anything, and every blocked action returns exactly "Your account is read-only. Renew your subscription to make changes."
- No paid AI call or job runs for a read-only account.
- Billing, payment, resubscription, support requests, password change, and logout work while read-only; email digest settings are blocked.
- Paying or resubscribing within 30 days restores full access and clears readOnlyStartedAt, with all data intact.
- FREE and COMPED accounts never become read-only.
- The cancellation-scheduled message shows the exact text with the period end date.
Run the worker boundary test (--conditions=react-server) and confirm processApplicationJob still loads cleanly. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming account lifecycle B3 (read-only), and push that branch. Do not merge into main or push main.

REPORT
1. The migration SQL.
2. The guard and writable check, with file and line.
3. Every billing transition and what sets it, before and after Stripe is live.
4. Every action and job covered by read-only, and every allowed exemption.
5. Where each message renders.
6. Every file changed.
7. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
8. The commit hash and branch pushed.
9. Confirmation that no git command discarded work and nothing outside B3 changed.
