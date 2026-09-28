SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Implement Batch C of the approved plan docs/prompts/harper-single-qa-surface-plan-report.md (section 8, defects 8b to 8e). Fix at the root with server-side rules; no output filtering at render time, no temporary fixes, no data repair, no migrations, no schema changes. Never silence type or lint errors.

SURGICAL RULE
Batch C only: the four question and result defects below, plus one regression test. Do not change Harper's prompt text (see STOP below), the Harper page layout, Stage, Outreach, the Cheat Sheet, learnings, role-expertise questions (Batch D), the Phase 1 gate, or serialization. Add no features.

HARPER RULES THAT APPLY
Harper regenerates, then accepts, and never blocks, with one exception: the seeker's raw reply is never shown as Harper's result. Every rejection must be bounded: a rejected question or result may cause at most the existing single regeneration, never an unbounded or repeated paid replan.

DEFECTS
8b. A company mission statement or company pitch from the posting becomes a Harper gap question. Fix so mission, pitch, and company-statement text from the posting is never turned into a gap or a question, including mission-like text in required or outcome fields that the current looksLikeCompanyPitch misses. It can still inform context; it is never a question.
8c. The seeker's reply is echoed back as Harper's result, including paraphrased meta-commentary about the question itself (for example the draft resume bullet "Clarified that a company statement needed to be reframed as an interview question."). Tighten the server-side check (isRawSeekerResult and the quality check) so a result that restates the seeker's reply, or that describes the question instead of answering it, is rejected and regenerated once. If it still fails, do not show it as Harper's result; report exactly what is shown instead, following the existing rule.
8d. An orphan question with no context (for example "Tell me what happened, what you did, and what the result was.") is shown. Fix so every question Harper asks is tied to its gap, requirement, or topic and names what it is about; a context-free template question is rejected server-side and never shown or stored as a question. A rejected question is dropped, not replaced by a template.
8e. Near-duplicate questions are not caught (two career walk-through questions, Merion to OpenText and Aerotek to OpenText). Fix so questions with the same intent are recognized even when the employers or wording differ. At minimum, every career walk-through question is recognized as the chronology topic, and only one career walk-through exists per application. Explain how intent is determined without guessing.
STOP
If any fix requires changing Harper's prompt text, do not change it: show the exact current text and the proposed change with the reason, and stop for approval on that defect only. Implement the others.
REGRESSION TEST
Add a permanent test that a profile's own answered coach items (cheatSheet:contact:{id}:likely:{n}) and its own interviewer questions never appear in that same profile's "Additional Interview Prep Q&A" (additional-prep-qa.ts / harper-display-qa.ts). This was verified with a throwaway test during the B5 deploy.
TESTS
Add automated tests that assert:
- Mission, pitch, and company-statement text (including mission-like required or outcome text) never becomes a gap or a question.
- A result that restates the seeker's reply or describes the question is rejected and regenerated once, and is never shown as Harper's result.
- A context-free template question is rejected, never stored or shown, and not replaced by a template.
- Two career walk-through questions with different employers are recognized as the same intent; only one exists per application.
- Every rejection is bounded to the existing single regeneration; no repeated paid replan.
- The B5 regression test above.
Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, commit on branch checkpoint/harper-prep-hub (update it from main first) with a message naming Harper Batch C, and push that branch. Do not merge into main or push main.
REPORT
1. For each defect: root cause, the fix, with file and line, and how it is bounded.
2. Any defect stopped for prompt approval, with the exact current and proposed text.
3. What is shown when a result still fails in 8c.
4. How question intent is determined in 8e.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that nothing outside Batch C and the regression test changed.
