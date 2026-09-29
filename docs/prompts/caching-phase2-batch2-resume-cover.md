Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. One shared mechanism: the Phase 1 paid-call gate (runPaidStructuredCall, PaidCallReceipt, fingerprintPaidCallInputs). No per-call-site patches, no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.

SURGICAL RULE
Caching Phase 2, batch 2 only: gate the resume and cover letter paid paths, per Part C of docs/prompts/overnight-remaining-punch-list-report.md. Do not change prompts, models, outputs, or any other paid call. Nothing may run on a page view. Add no features.

PRODUCT OWNER RULE
Unchanged inputs mean no paid call, including when the seeker clicks Generate or Regenerate. The current resume or cover letter is kept.

GATE THESE
1. The presentation plan (writePresentationPlanWithModel), the resume generator, the cover letter generator, and asset claim validation (validateAssetClaimsWithModel), as each is used for the resume and cover letter. Report every trigger for each, with file and line.
2. For each paid call: fingerprint = the exact inputs it sends to the model (for example the job, the approved Harper statements and stories it uses, the Personal Profile evidence it uses, the plan it builds on, and prompt and schema version). Report the inputs, and which inputs deliberately do not belong.
3. The skip happens before enqueue where possible, and in the worker as the second line of defense. A worker retry after a recorded receipt makes no provider call.
4. Seeker messages, only when the gate skips because nothing changed: clicking Generate or Regenerate for the resume shows exactly "No Changes To Resume"; for the cover letter, exactly "No Changes To Cover Letter". Show them where the current generate message is shown. Keep the existing messages when work runs.
5. Serialization: once gated, move RESUME and COVER_LETTER to the serialized follow-up policy in the shared type-to-policy mapping (one IN_PROGRESS and one PENDING per key; the PENDING job starts after the running job finishes and reads the latest inputs). Report the change.

TESTS
Add automated tests that assert, for the resume and the cover letter:
- Unchanged inputs make no provider call for the plan, generator, or claim validation, enqueue no paid job, and show the exact "No Changes To ..." message.
- A real input change runs each needed call once.
- A worker retry after a recorded receipt makes no provider call.
- A request during a running same-key job creates one PENDING follow-up that runs after it and reads the latest inputs.
- Nothing runs on a page view.
Run the worker boundary test (--conditions=react-server) and confirm processApplicationJob still loads cleanly. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming Caching Phase 2 batch 2, and push that branch. Do not merge into main or push main.

REPORT
1. Every trigger, fingerprint input set, operation name, subjectKey, and skip point, per paid call.
2. Where each message renders.
3. The serialization policy change.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
6. The commit hash and branch pushed.
7. Confirmation that no git command discarded work and nothing outside this batch changed.
