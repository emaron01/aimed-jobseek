Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. One shared mechanism: the Phase 1 paid-call gate (runPaidStructuredCall, PaidCallReceipt, fingerprintPaidCallInputs). No per-call-site patches, no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.

SURGICAL RULE
Caching Phase 2, batch 1 only: gate the three paid paths below so they make no paid call when their inputs are unchanged, per Part C of docs/prompts/overnight-remaining-punch-list-report.md. Do not change prompts, models, outputs, what the seeker sees (beyond the existing "No Changes To ..." pattern where a click is skipped), or any other paid call. Nothing may run on a page view. Add no features.

PRODUCT OWNER RULE
Unchanged inputs mean no paid call, including when the seeker clicks Save or submits again. The current result is kept.

GATE THESE
1. Job posting parse (interpretJobPosting): fingerprint = the posting text and fields that feed the parse, plus prompt and schema version. Saving an unchanged posting makes no paid call and keeps the current parse. Report every trigger that runs it.
2. Cheat Sheet overview (generateApplicationSummaryShell): fingerprint = the exact sources the shell uses, plus prompt and schema version. Build on the existing shell sourceHash if it matches those inputs; report what it covers today and what was missing. The per-person sections are already gated; do not change them.
3. "Missing relevant experience? Add it here" (saveWhatYouShouldKnowAboutMeAction): the Harper reassess it enqueues runs only when what the seeker entered actually changed, using a fingerprint of that input plus the consultation prompt version, stored with the Phase 1 gate. Saving the same text again enqueues nothing.
For each: report the fingerprint inputs, the PaidCallOperation name, the subjectKey, where the skip happens (before enqueue where possible, and in the worker as the second line of defense), and what the seeker sees when a save or click is skipped. If a skipped click would leave the seeker with no feedback and new wording is needed, say where; do not write wording.

TESTS
Add automated tests that assert, for each of the three:
- Unchanged inputs make no provider call and enqueue no paid job.
- A real input change runs the call once.
- A worker retry after a recorded receipt makes no provider call.
- Nothing runs on a page view.
Also run the worker boundary test (--conditions=react-server) and confirm processApplicationJob still loads cleanly.
Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming Caching Phase 2 batch 1, and push that branch. Do not merge into main or push main.

REPORT
1. For each of the three: triggers, fingerprint inputs, operation name, subjectKey, where the skip happens, and what the seeker sees on a skip (and any place wording is needed).
2. What the existing shell sourceHash covered and what was missing.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that no git command discarded work and nothing outside this batch changed.
