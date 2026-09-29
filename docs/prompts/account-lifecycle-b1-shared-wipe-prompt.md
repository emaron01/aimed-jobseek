Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no Prisma schema changes in this batch. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.

SURGICAL RULE
Batch B1 only, per section 1, section 2, and batch B1 of docs/prompts/account-lifecycle-plan-report.md, with the product owner's decisions below. Build the shared full wipe and wire Super Admin delete to it. Do not build self-serve delete (B4), read-only billing states (B3), in-flight job and paid-gate hardening (B2), the scheduled wipe (B5), or remove the selective purge (B6). Add no features.

PRODUCT OWNER DECISIONS
1. One shared wipe (for example wipeOrganizationAccount in src/lib/account/wipe-organization.ts) deletes everything belonging to the account: every row owned by the organization (via the existing cascades), plus support tickets and their notes, transactional email events, and admin audit events tied to the organization, its members, or its members' emails, plus the members' authentication records when they have no other membership and are not platform operators. Nothing personal remains.
2. Order, per plan section 1.2: load the organization, members, emails, and Stripe ids; cancel any active Stripe subscription (keep today's rule: if a subscription id exists and Stripe is not configured, refuse the wipe and change nothing); stop in-flight work by marking PENDING and IN_PROGRESS application jobs and research runs for the organization FAILED with a stable terminal reason; delete support ticket notes, support tickets, transactional email events, and admin audit events in scope; delete the organization (cascades); purge orphaned members' users and authentication records. The Stripe Customer stays in Stripe.
3. A user in other organizations keeps their user, authentication, and other organizations; only the target organization is wiped.
4. Atomic and resumable: run the database steps in one transaction with an adequate timeout, as the existing purge does. The wipe is idempotent: running it again on a partly or fully wiped account completes cleanly without error.
5. Deletion record (option B): after a successful wipe, record only an anonymous entry with the date and the reason (self_serve, admin, or automatic), with no organization id, name, email, user id, Stripe id, or any other identifier. Store it without a schema change (for example in PlatformSetting). The wipe must not write today's AdminAuditEvent containing the organization name, member ids, and Stripe ids.
6. Super Admin delete (deleteOrganization and deleteOrganizationAction) calls the shared wipe with reason admin. Keep its existing confirmation step and Super Admin authorization.
7. Mailbox connection rows are deleted with the organization; no provider revocation.

TESTS
Add automated tests that assert:
- A real-Postgres test that creates a fully used account (Personal Profile and stories, application, job requirement, company research and run, hiring team and personas, contacts, interview stages, Harper session with turns and statements, cheat sheet, resume, cover letter, outreach, application jobs, PaidCallReceipt rows, usage events, voice sample, support ticket with notes, transactional email events, admin audit events), wipes it, and asserts: no row with that organizationId remains in any model; no support ticket, note, email event, or audit event tied to the organization, its members, or their emails remains; the solo owner's user and authentication records are gone; and signing up again with the same email creates a new, empty organization.
- A user in two organizations: wiping one leaves the other organization, the user, and their authentication intact.
- A pending and a running application job and research run are marked FAILED before the organization is deleted, and nothing is re-created.
- Running the wipe twice completes cleanly.
- With a Stripe subscription id and no Stripe configuration, the wipe refuses and changes nothing.
- The anonymous deletion record contains only a date and a reason, and no identifier.
- Super Admin delete runs the shared wipe and writes no identifying audit event.
Run the worker boundary test (--conditions=react-server) and confirm processApplicationJob still loads cleanly. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming account lifecycle B1 (shared wipe), and push that branch. Do not merge into main or push main.

REPORT
1. The wipe's steps in order, with file and line.
2. How support tickets, notes, email events, and audit events are selected and deleted.
3. How other-organization members and platform operators are handled.
4. The transaction, idempotency, and Stripe refusal behavior.
5. How the anonymous deletion record is stored, and confirmation it holds no identifier.
6. Every file changed.
7. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
8. The commit hash and branch pushed.
9. Confirmation that no git command discarded work and nothing outside B1 changed.
