SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Remove the dead path completely. No temporary fixes, no data repair, no migrations, no schema changes. Never silence type or lint errors.

SURGICAL RULE
Batch D0 only: remove the unused interview-notes gap check, per section 8 of docs/prompts/harper-batch-d-methodology-plan-report.md. Change nothing else. Add no features.

REMOVE
1. The call to refreshConsultationOffer in updateInterviewStageAction (src/app/actions/interview.ts, about lines 130-135).
2. refreshConsultationOffer (src/lib/interview/guide.ts, about 753-782) and detectInterviewNoteGap (src/lib/interview/stages.ts, about 488-525), and the tests that exist only for them.
3. Every write to InterviewStage.consultationOfferJson. Leave the database column in place, unused (no migration).
4. The product-config string consultationOffer (src/lib/product-config/interview.ts, about line 52) if nothing else references it.
Before removing, confirm again that nothing in src/ reads consultationOfferJson or renders the offer. If anything does, STOP and report it.

TESTS
Add or update automated tests that assert:
- Saving notes after through updateInterviewStageAction no longer calls refreshConsultationOffer or detectInterviewNoteGap and writes no consultationOfferJson.
- Saving notes before and after still saves the notes and triggers the same cheat-sheet and consultation enqueues as before.
Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed or removed and why.

COMMIT
After everything passes, commit on branch checkpoint/harper-prep-hub (update it from main first) with a message naming Harper Batch D0, and push that branch. Do not merge into main or push main.

REPORT
1. Confirmation that nothing read consultationOfferJson.
2. Everything removed, with file and line.
3. Every file changed.
4. Tests added, changed, or removed, with reasons; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that nothing else changed.
