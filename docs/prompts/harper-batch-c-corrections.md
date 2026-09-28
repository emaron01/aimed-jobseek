SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. Fix at the root; no output filtering at render time, no temporary fixes, no data repair, no migrations, no schema changes. Never silence or evade a check (no building strings from parts to avoid a guard, no @ts-ignore, no disabling rules).
SURGICAL RULE
Correct Batch C (docs/prompts/harper-batch-c-question-result-defects-report.md, commits 435fbb0 and 16becfc on checkpoint/harper-prep-hub) only as listed below. Do not change Harper's prompt text, the Harper page layout, Stage, Outreach, the Cheat Sheet, learnings, the Phase 1 gate, or serialization. Add no features.
HARPER RULE
Harper regenerates, then accepts, and never blocks. The one exception: the seeker's raw reply is never shown as Harper's result. That exception must never block the session or anything beyond the one item.
FIX 1: Walk-through intent is too broad (8e)
looksLikeCareerWalkThrough treats "walk (me) through" plus experience, background, or a from ... to ... phrase as a career walk-through, so ordinary behavioral questions get classed as chronology and dropped as duplicates.
- Narrow it so only a true career chronology question (the seeker's roles or career in sequence) is classed as chronology. "Experience", "background", or a from ... to ... phrase alone must not qualify.
- Add negative tests that must NOT be classed as chronology, including: "Walk me through your experience building a front-line management layer." and "Walk me through how you went from an unreliable forecast to 5-10% accuracy." and "Walk me through your background with MEDDIC." Keep positive tests for the two real career walk-throughs (Merion to OpenText, Aerotek to OpenText) and similar career-sequence questions.
- Explain the final rule.
FIX 2: Paraphrase check must not reject good coaching (8c)
- Report exactly how isParaphrasedSeekerReply and isQuestionMetaCommentary decide (thresholds, patterns), with file and line.
- Validate against real results: run isRawSeekerResult on every approved Harper result (interview answer and resume bullet) with its seeker reply, in the local development database and existing fixtures. Report the count checked and the count flagged. A result that restates the seeker's story in polished form is legitimate coaching and must not be flagged. If any legitimate approved result is flagged, fix the rule at the root until none are, and report what changed.
- Keep rejecting results that repeat the seeker's reply nearly verbatim, and results that describe the question instead of answering it (for example "Clarified that a company statement needed to be reframed as an interview question.").
FIX 3: A failed result affects only its item, never the session (8c)
When a result still fails after the bounded regeneration:
- Do not set the consultation session to FAILED and do not show "Harper could not finish this coaching. Retry."
- Keep the seeker's answer recorded as their answer. Store and show no Harper interview answer or resume bullet for that item.
- Under that item show exactly: Add a bit more detail so Harper can shape this answer.
- The seeker's next reply to that item is processed normally through the existing reply path. No automatic retry and no paid call happens until the seeker adds detail.
- Every other item and the rest of the session continue normally.
FIX 4: Do not evade the canned-question guard
- Report the existing guard that forbids canned question text in questions.ts (file, line, and what it checks).
- Remove the string-building workaround (GUIDE_THROUGH built with join and similar). Move intent and template-detection patterns into a separate detection module that the guard does not cover by design, or update the guard to explicitly allow detection patterns while still forbidding canned question text used to ask questions. Report which you chose and why. The guard must still catch any canned question text used to generate questions.
FIX 5: Verify 8b against a real posting
Run the expanded company-pitch filter (looksLikeCompanyPitch and the evidenceTargets skip) on the CSC Senior Director of Sales - North America posting's parsed requirements (responsibilities, required, scorecard mission, outcomes, competencies). Report every item excluded and every item kept. The mission statement ("Join us to help protect the world's most valuable digital brands...") must be excluded. Real requirements and outcomes (for example "Deliver North America revenue targets across expansion and new logo acquisition.", "Build and operationalize a repeatable, scalable sales process.", and every Required item) must be kept. If any real requirement is excluded, fix the rule at the root and report what changed. Add this as a permanent test with the posting's items as a fixture.
TESTS
Add or update automated tests for every fix above: the chronology negative and positive cases; the paraphrase check passes every legitimate approved result and still rejects verbatim echoes and question meta-commentary; a failed item shows the exact message, stores no Harper result, does not fail the session, and makes no paid call until the seeker replies; the guard still catches canned question text; the CSC posting filter excludes only the mission and pitch text. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, commit on branch checkpoint/harper-prep-hub with a message naming the Batch C corrections, and push that branch. Do not merge into main or push main.
REPORT
1. FIX 1: the final walk-through rule and test cases.
2. FIX 2: how the paraphrase check decides, counts checked and flagged, and any change made.
3. FIX 3: what changed, with file and line.
4. FIX 4: the guard, the option chosen, and why.
5. FIX 5: every excluded and kept item for the CSC posting, and any change made.
6. Every file changed.
7. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
8. The commit hash and branch pushed.
9. Confirmation that nothing outside these fixes changed.
