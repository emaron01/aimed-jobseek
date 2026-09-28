SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no output filtering, no temporary fixes, no data repair, no migrations, no schema changes. Never silence type or lint errors.

SURGICAL RULE
Fix only the issues below: Harper's person view (Batch B3, docs/prompts/harper-batch-b3-implement-report.md) and one line of Stage help text. Do not change the Cheat Sheet page (it keeps its answer forms until Batch B4), Stage behavior, Outreach, Harper's prompts or planning, learnings, the Phase 1 gate, serialization, or any paid call. Rendering must never enqueue a job or make a paid call. Add no features.

CONTEXT
B3 renders the person profile on Harper with CheatSheetPersonBody and showCoachAnswerForms={false}, plus person-prep and cheatSheet:contact:* items in a separate QuestionList. A coach item that needs seeker input (for example a likely question with a Reply box) only becomes a Harper item after it is answered, so an unanswered one cannot be answered on Harper. When Batch B4 makes the Cheat Sheet read-only, it would be unanswerable anywhere. An answered coach item may also render twice on Harper (in the profile and in the QuestionList).

FIXES
1. Answer in context on Harper: in Harper's person view, every coach item that needs seeker input shows its answer form inline, in its place in the profile (under its likely question or section), using the existing answer path (answerCheatSheetCoachItem, record-before-enqueue, reply waits for Harper). Answer forms are hidden or disabled while Harper is analyzing, as elsewhere on Harper.
2. Each question once: a coach item and its answer render once on Harper, in its place in the profile. The separate person QuestionList no longer repeats contact-linked cheatSheet items that the profile already shows. Person-prep questions not shown in the profile still render in the person view, once. The B2 render invariant must count items rendered in the profile, so every item with seeker content or an open question renders exactly once.
3. "Edit", "Show your replies", "Ignore" and "Ignored" behave in the profile as Batch A decided.
4. Stage help text: replace the Interview stages section help ("Record each interview, choose the interviewer, and keep their cheat sheet section here as the archive for that conversation.") with exactly:
Record each interview: who you're meeting, when, and how. After each one, add your Post Interview Notes.

REPORT FIRST, THEN IMPLEMENT
Before changing code, report with file and line: every coach item kind that can need seeker input, how CheatSheetPersonBody renders each today, and whether an answered coach item currently renders twice on Harper. Then implement.

TESTS
Add automated tests that assert:
- An unanswered coach item that needs seeker input shows an answer form inline in Harper's person view, and answering it uses the existing path.
- An answered coach item renders once on Harper, in its place in the profile, not also in the separate list.
- Person-prep questions render once in the person view.
- The render invariant holds: every item with seeker content or an open question renders exactly once.
- Answer forms are hidden or disabled while Harper is analyzing.
- The Cheat Sheet page still shows its answer forms (unchanged until B4).
- The Interview stages help text is exactly the new wording.
- Rendering enqueues no job and makes no paid call.
Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on branch checkpoint/harper-prep-hub with a message naming the B3 person-view answer fix and Stage help text, and push that branch. Do not merge into main or push main.

REPORT
1. The report-first findings.
2. What changed, with file and line.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that nothing outside these fixes changed.
