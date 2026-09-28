SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Implement Batch B5 of the approved plan docs/prompts/harper-prep-hub-plan-report.md with the decision below, which overrides the plan's Hiring Manager chain design. Fix at the root; no output filtering, no temporary fixes, no data repair, no migrations, no schema changes. Never silence type or lint errors.

SURGICAL RULE
Batch B5 only: a display-only "Additional Interview Prep Q&A" section on every Direct role's profile. Do not change how questions are asked, answered, or stored; Harper's prompts or planning; learnings; Stage; Outreach; cheat-sheet generation; the Phase 1 gate; serialization; or any paid call. Rendering must never enqueue a job or make a paid call. Add no features.

PRODUCT OWNER DECISION
The code has no record of who sits above the Hiring Manager, so instead: every Direct role's profile shows an "Additional Interview Prep Q&A" section with every question asked and answered on Harper, because the people who decide care about all of it.
1. Which profiles: every person or role whose Hiring Team involvement is Direct, in Harper's person view and in that person's section on the Cheat Sheet (including print).
2. What it shows: every question on Harper that has an answer (Where you stand topics, general topics such as "Why you want to work at this company" and the career walk-through, and other interviewers' questions), each with the answer Harper currently shows for it, in the order Harper shows them. Questions already shown in that same profile's own content are not repeated in this section.
3. Display only: no answer, reply, or edit forms in this section. Each item shows a text link "Edit" to that one question on Harper (#harper-q:{questionTurnId}, or the coach anchor for coach items), opening Harper with the right person selected. There is one place to edit each question.
4. Show nothing (not an empty heading) when there are no answered questions.
5. The render invariant counts each item once at its primary place; this section is a secondary display and must not break the invariant or create a second editable copy.

TESTS
Add automated tests that assert:
- Every Direct role's profile in Harper's person view and on the Cheat Sheet (including print) shows "Additional Interview Prep Q&A" with every answered question and its current answer, in Harper's order.
- Indirect roles do not show the section.
- Questions already in that profile's own content are not repeated in the section.
- Each item has an "Edit" link to its one question on Harper, and the section has no answer, reply, or edit forms.
- No heading renders when there are no answered questions.
- Editing an answer on Harper changes what the section shows everywhere, with no duplicate record created.
- The render invariant still holds.
- Rendering enqueues no job and makes no paid call.
Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on branch checkpoint/harper-prep-hub (update it from main first) with a message naming Harper Batch B5, and push that branch. Do not merge into main or push main.

REPORT
1. How Direct roles are identified, and where the section renders, with file and line.
2. How the answered-question list is assembled and ordered, and how repeats within a profile are excluded.
3. The Edit link targets.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
6. The commit hash and branch pushed.
7. Confirmation that asking, answering, storage, prompts, planning, learnings, Stage, Outreach, generation, and paid calls are unchanged.
