Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. One shared mechanism: the Phase 1 paid-call gate (runPaidStructuredCall, PaidCallReceipt, fingerprintPaidCallInputs). No per-call-site patches, no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.

SURGICAL RULE
Caching Phase 2, batch 3 only: gate the live paid paths for outreach, thank-you and check-in notes, and contact profiles, per Part C of docs/prompts/overnight-remaining-punch-list-report.md. Do not change prompts, models, outputs, or any other paid call. Leave paths that are unreachable with default flags (legacy email sequences and similar) unchanged, and list them. Nothing may run on a page view. Add no features.

PRODUCT OWNER RULE
Unchanged inputs mean no paid call, including when the seeker clicks Generate or Regenerate. The current result is kept.

GATE THESE
1. Application outreach on the Outreach page: the outreach fact selection and generation calls, and outreach claim validation (validateAssetClaimsWithModel on the outreach path, currently ungated). Subject per contact (and per channel if outreach is generated per channel).
2. Thank-you note and check-in generation (on the Outreach page since Batch B1), including the thank-you clarifying questions call if it is paid. Subject per interview stage (and per channel if generated per channel).
3. Contact profile from pasted LinkedIn text: extractInterviewerFacts and generateIndividualProfileWithModel (CONTACT_PROFILE jobs). Subject per contact.
For each paid call: report every trigger with file and line; fingerprint = the exact inputs it sends to the model plus prompt and schema version; report which inputs deliberately do not belong; skip before enqueue where possible and in the worker as the second line of defense; a worker retry after a recorded receipt makes no provider call.

SEEKER MESSAGES
Only when the gate skips because nothing changed, show exactly these, where the current generate or save message is shown today; keep the existing messages when work runs:
- Outreach generate or regenerate for a contact: No Changes To Outreach
- Thank-you note: No Changes To Thank-You Note
- Check-in: No Changes To Check-In
- Contact profile build or rebuild: No Changes To {Name}'s Profile (the contact's name as displayed)

SERIALIZATION
Once gated, move OUTREACH and CONTACT_PROFILE (and the job type used for thank-you and check-in, if it has its own) to the serialized follow-up policy in the shared type-to-policy mapping. Report each change.

TESTS
Add automated tests that assert, for each gated path:
- Unchanged inputs make no provider call, enqueue no paid job, and show the exact message.
- A real input change runs each needed call once.
- A worker retry after a recorded receipt makes no provider call.
- A request during a running same-key job creates one PENDING follow-up that runs after it and reads the latest inputs.
- Nothing runs on a page view.
Run the worker boundary test (--conditions=react-server) and confirm processApplicationJob still loads cleanly. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming Caching Phase 2 batch 3, and push that branch. Do not merge into main or push main.

REPORT
1. Per paid call: triggers, fingerprint inputs, operation name, subjectKey, and skip points.
2. Unreachable legacy paths left unchanged.
3. Where each message renders.
4. The serialization policy changes.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that no git command discarded work and nothing outside this batch changed.
