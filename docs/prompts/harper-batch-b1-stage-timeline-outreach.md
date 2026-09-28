Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Implement Batch B1 of the approved plan docs/prompts/harper-prep-hub-plan-report.md with the decisions below, which override the plan where they differ. Fix at the root; no output filtering, no temporary fixes, no data repair, no migrations, no schema changes.

SURGICAL RULE
Batch B1 only: the Interview stages page (Stage) becomes a timeline, and any outreach on Stage moves to the Outreach page. Do not change Harper's page, the Cheat Sheet page, Harper's prompts or planning, what the note fields feed, the interview-guide clarifying backend, the Phase 1 gate, serialization, or any paid call. Removing or moving UI must never enqueue a job (including APPLICATION_SUMMARY or CONSULTATION) or make a paid call. Add no features.

STEP 1: REPORT FIRST
Before changing anything, report with file and line:
1. Note fields on Stage: for "Newly gained information" (with its "Add to cheat sheet" button), "Notes before", and "Notes after": where each is stored; every place each is read (Harper's coaching and planning for future interviews, the interviewer's person payload, cheat-sheet sources, fingerprints); and what each triggers when saved. State plainly whether each one reaches Harper for future interviews.
2. Interview builds: every control on Stage that starts a persona or contact profile build, including "Use this interviewer", adding a new interviewer, and setting up an interview.
3. Outreach on Stage: every outreach element (thank-you clarifying questions, thank-you generation, check-in, anything else) that can render on any Stage view (list and detail), with the exact conditions under which each renders. The product owner does not see any thank-you element on Stage. If an element can never render under any reachable condition, say so and do not move it.
4. What the Outreach page already offers for thank-you notes today, including skipThankYouQuestions.

STEP 2: IMPLEMENT
1. Remove from Stage:
   - The "Review open questions for this interview" button.
   - The interviewer's cheat-sheet section shown on Stage (the embedded cheat-sheet person prep and answer forms, InterviewStagePanel rendering CheatSheetPersonBody), including after the notes form.
   - Gap consultation calls to action and every other question-answering form or answer display.
2. The "Edit" button next to the interviewer's name is removed from Stage. In its place, the interviewer's name is a text link to that interviewer's section on Harper's page (#harper-contact:{contactId}). No id is shown as text.
3. "Use this interviewer" stays, and it only assigns the selected person to the interview. It must not start a persona or contact profile build. If STEP 1 shows this leaves an interviewer with no way to get their prep built, STOP on this item and report the build paths that remain, for approval.
4. Rename the button "Add newly gained information here" to "Post Interview Notes". The notes form it opens (Newly gained information, Notes before, Notes after, Expected decision date, Outcome, Save stage) keeps its fields and behavior, and continues to keep the record of the seeker's notes.
5. Keep adding, editing, and scheduling interviews and "Add new interviewer" exactly as today.
6. Every reachable outreach element found in STEP 1 moves from Stage to the Outreach page with its existing behavior, under the same conditions. If the thank-you flow on Stage includes clarifying questions, the moved flow on the Outreach page includes them exactly as Stage offers them; skipThankYouQuestions must not drop them for the moved flow.
7. Answers already given through Stage are stored in Harper's session and must still appear on Harper's page.

TESTS
Add automated tests that assert:
- Stage renders no "Review open questions for this interview" button, no cheat-sheet person section, no answer form or answer display, no gap consultation call to action, and no outreach element.
- The interviewer's name links to #harper-contact:{contactId}, and no "Edit" button renders on Stage.
- "Use this interviewer" assigns the person and starts no persona or contact profile build.
- The "Post Interview Notes" button opens the notes form, and saving it keeps the same fields and behavior as before.
- Adding, editing, and scheduling interviews and "Add new interviewer" work as before.
- Each moved outreach element renders on the Outreach page under the same conditions and behaves as it did on Stage.
- Answers previously given through Stage appear on Harper's page.
- Rendering Stage and the Outreach page enqueues no job and makes no paid call (extend the no-ai-on-view tests).
Run the full existing test suite, including real-Postgres tests, and confirm it passes with no new failures. Never change an existing test only to make it pass; report any test changed and why.

REPORT
1. STEP 1 findings (note fields, build triggers, outreach render conditions, Outreach page today).
2. Every element removed, changed, or moved, with file and line.
3. Whether any item stopped for approval, and why.
4. How thank-you clarifying questions are preserved on the Outreach page (if they existed on Stage).
5. Confirmation that answers given through Stage appear on Harper's page, with how you verified it.
6. Every file changed.
7. Tests added or changed, with reasons for any changed existing test, and the full test suite result, confirming the real-Postgres tests ran.
8. Confirmation that Harper's page, the Cheat Sheet page, prompts, planning, what the note fields feed, and paid calls are unchanged.
