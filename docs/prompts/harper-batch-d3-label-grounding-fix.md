Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. If anything unexpected happens, STOP and report.

SURGICAL RULE
Correct only the two items below in Batch D3 (docs/prompts/harper-batch-d3-car-star-answers-report.md, commit a84af8e on checkpoint/harper-prep-hub). Change nothing else. Add no features.

ITEM 1: The label check must not reject real answers
containsFrameworkOrPartLabel (src/lib/consultation/polish-parts.ts, about lines 88-101) rejects fields containing framework names or part labels.
- Report the exact current rule (patterns, case sensitivity, word boundaries).
- Fix it so it rejects only: (a) part labels used as labels, meaning Challenge, Situation, Task, Action, or Result followed by a colon or used as a heading; and (b) explicit method references such as "STAR method", "STAR format", "STAR framework", "CAR method", "CAR format", "CAR framework", "the STAR technique", case-insensitive. It must never reject the bare words star, stars, car, or cars, in any case, or ordinary uses of challenge, situation, task, action, or result in a sentence.
- Add tests that these pass: "we reached a four-star rating", "I won the Rising Star award", "I negotiated car rental partnerships", "I made the STAR Club two years running", "the challenge was a 30% staffing gap", "the result was a calmer unit". Add tests that these are rejected: "Challenge: the unit was short-staffed", "Result: patients were discharged sooner", "Using the STAR method, I...", "Here is my answer in CAR format".

ITEM 2: groundingJson on approve
D3 changed approve so it no longer clears ConsultationStatement.groundingJson.
- Report why approve cleared it before (git history or code comments) and every reader of groundingJson in src/, with file and line and what each expects.
- If every reader handles the new parts shape (or ignores it), keep the change and state why. If any reader expects [] or breaks on the new shape, fix that reader at the root so approved statements keep their parts safely, and report it. Do not restore the wipe unless a reader requires it, and if so, STOP and report for approval.

TESTS
Add or update automated tests for both items as described, plus: approving a statement keeps its parts and answerFramework in groundingJson, and every reader of groundingJson works with both the new shape and the legacy [] value. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on branch checkpoint/harper-prep-hub with a message naming the D3 label check and groundingJson fixes, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: the rule before and after, and the test cases.
2. ITEM 2: why approve cleared groundingJson, every reader, and the outcome.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that no git command discarded work and nothing outside these two items changed.
