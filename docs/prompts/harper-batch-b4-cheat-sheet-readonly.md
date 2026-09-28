SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Implement Batch B4 of the approved plan docs/prompts/harper-prep-hub-plan-report.md with the decisions below, which override the plan where they differ. Fix at the root; no output filtering, no temporary fixes, no data repair, no migrations, no schema changes. Never silence type or lint errors.

SURGICAL RULE
Batch B4 only: the Cheat Sheet page becomes read-only, with links to Harper, and gains "Notes From Interviews With {Name}". Do not change Harper's page (except adding anchors needed for the links below), Stage, Outreach, Harper's prompts or planning, learnings, the cheat-sheet generation or regenerate and build controls, the Phase 1 gate, serialization, or any paid call. Rendering must never enqueue a job or make a paid call. Add no features.

PRODUCT OWNER DECISIONS
1. The Cheat Sheet is the read-only interview prep document organized by Harper: company profile, position, each person's prep (what they care about, how your experience connects, how to position yourself, key statements, likely questions with approved answers, questions to ask), with search, display, and print unchanged. It shows answers; it never takes them.
2. Remove every answering and reply form from the Cheat Sheet page (the coach answer forms under likely questions and anywhere else).
3. Links to Harper in place of each former form:
   - An answered question shows a text link "Edit" to that exact question on Harper (#harper-q:{questionTurnId}).
   - An unanswered question that needs the seeker's input shows a text link "Answer" to that exact question in the person's inline profile on Harper. If that coach item has no anchor on Harper yet, add a stable anchor for it in Harper's person view (ids only in the URL fragment, never shown as text) and report its format.
   - The link opens Harper with that person's profile selected and the question in view.
4. "Notes From Interviews With {Name}": in each person's section, a read-only section with that exact heading (using the person's name) compiling everything the seeker recorded about interviews with that person: their "Newly gained information" notes (cheatSheetNotesJson) and the "Notes before" and "Notes after" of every interview stage where that person was an interviewer, ordered by interview date, each labeled with its interview (type and date) and note kind. Display only; show nothing (not an empty heading) when a person has no notes. Report whether any of these notes already render on the Cheat Sheet today, and render each note once.
5. Cheat-sheet generation, regenerate, and build controls stay exactly as they are.

TESTS
Add automated tests that assert:
- The Cheat Sheet page renders no answering or reply form anywhere.
- An answered question shows an "Edit" link to #harper-q:{questionTurnId}.
- An unanswered question needing input shows an "Answer" link to its anchor in Harper's person view, and that anchor exists on Harper.
- Company profile, position, and person prep content, search, display, and print render as before.
- "Notes From Interviews With {Name}" shows each person's newly gained information and notes before and after from their interviews, in date order, each once, and does not render when the person has no notes.
- Generation, regenerate, and build controls are unchanged.
- Rendering the Cheat Sheet and Harper enqueues no job and makes no paid call.
Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on branch checkpoint/harper-prep-hub with a message naming Harper Batch B4, and push that branch. Do not merge into main or push main.

REPORT
1. Every form removed and every link added, with file and line, and the anchor format for unanswered coach items.
2. How "Notes From Interviews With {Name}" is compiled, whether any notes rendered on the Cheat Sheet before, and confirmation each note renders once.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that Harper (beyond anchors), Stage, Outreach, prompts, planning, learnings, generation controls, and paid calls are unchanged.
