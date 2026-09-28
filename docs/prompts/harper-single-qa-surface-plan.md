Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
All findings must be based on the actual code as it exists now, including the Phase 1 paid-call guard, same-key serialization (record-before-enqueue, consultation drain, reply waits for Harper), persona build reliability, the employerIcpFit switch-off, the Job Requirements page change, and learned notes feeding cheat sheets only (docs/prompts/learned-notes-cheat-sheet-only-report.md). Cite file paths, function names, and line numbers for every claim. No guesses; if something cannot be determined from the code, say so explicitly. The plan must fix root causes; no patches, no output filtering, no data repair, no migrations of existing data.

SURGICAL RULE
PLAN ONLY. Do not change any code, configuration, schema, prompts, tests, or data. Write the plan and stop. Coding starts only after the product owner approves it.

GOAL
Harper's page becomes the ONLY place the seeker answers questions. Stage organizes interviews. Cheat Sheet displays. The seeker never answers the same question in more than one place. What the seeker learns during the interview process shapes Harper's questions and answers.

PRODUCT OWNER DECISIONS
1. Harper page is the single Q&A surface, in this fixed order:
   a. Where you stand: the requirement summary (for example "Strong 8, Partial 3, None 0") and each requirement's rating with its reason, shown once. These requirement ratings compare the job with the seeker's Personal Profile and stay.
   b. General questions.
   c. One section per interviewer, in interview-date order from Stage, laid out the way the cheat sheet organizes each interviewer today, with open questions first.
2. No employer fit anywhere on Harper's page. Employer fit (scored against the employer ICP / Target Employer, for example "Good fit / Needs review / Poor fit") was scrapped and is switched off by employerIcpFit. It must not appear, be linked, or be referenced on Harper's page.
3. Stage is for organizing interviews only (who, when, how, the interviewer's details, and what the seeker learned). No questions or answers are shown or answered on Stage.
4. The Stage flow: add an interviewer, then Add Persona builds the persona through the existing build path and takes the seeker to that interviewer's section on Harper's page.
5. Cheat Sheet is read-only: display, search, and print the full cheat sheet built from Harper's answers. Any edit control on the cheat sheet is a link that takes the seeker to that exact question on Harper's page. No answering on the cheat sheet.
6. Harper page controls:
   - "Expand evidence" and "Show your replies" are text links, not buttons.
   - "Add another reply" is replaced by an "Edit" link. The edit box is shown only after the seeker clicks Edit.
7. What the seeker learned (learned notes and interview stage notes, including notesBefore and notesAfter) feeds Harper's question planning and coaching:
   - It shapes the general questions and, above all, the section of the interviewer the learning is about (for example, a recruiter saying the VP of Sales focuses on coaching and being in the field shapes the VP's questions).
   - It is additive: it can add new questions or adjust OPEN questions. It never discards, regenerates, or changes answers the seeker already approved; the seeker changes approved answers only through Edit.
   - Harper re-plans only when what the seeker learned actually changes (a new fingerprint under the Phase 1 gate pattern): one paid planning run per real change, serialized, never on a page view.
   - It does not feed or re-run the job parse, the requirement ratings in Where you stand, the resume, or the cover letter (the resume and cover letter are a one-time send). It continues to feed cheat sheets as today.
8. No other new paid calls. Moving where questions are shown must not regenerate any answer, persona, cheat sheet, or plan. The Phase 1 gate, serialization, the consultation drain, and "reply waits for Harper" must all keep working on every Harper section.
9. Do not propose new seeker-facing wording beyond "Edit". Where other wording is needed, say where, and the product owner will supply it.

PLAN FOR
1. Data: for the questions and answers shown today on Harper's page, Stage, and Cheat Sheet, state whether they are the same records rendered in three places or separate stores. Cite every model, field, and read path. If separate, state exactly what consolidation requires, and whether any answer given on Stage or Cheat Sheet today would be lost or duplicated.
2. Harper page structure: the components and data needed for the fixed order in decision 1, how interviewer sections are ordered by interview date, and how open versus answered questions are determined.
3. Employer fit on Harper's page: every place Harper's page shows, links to, or references employer fit today (including the removed review_fit suggestion), and confirmation that none remains with employerIcpFit off.
4. Stage: every Q&A element on Stage today and how it is removed; the Add Persona flow and how it navigates to the interviewer's Harper section after starting the existing build.
5. Cheat Sheet: every answering or editing control today, and how each becomes a link to the exact question on Harper's page (anchors or routes). Confirm the cheat sheet still builds from Harper's answers with no regeneration caused by this change.
6. Harper controls: the exact component changes for decision 6.
7. Learnings into Harper (decision 7): whether Harper reads learned notes or stage notes anywhere today; how they reach Harper's question planning (general and per interviewer), including how a learning recorded on one interview (for example the recruiter screen) is associated with the interviewer it is about; the fingerprint inputs; how additive planning preserves approved answers; and the exact trigger, confirmed serialized and never on page view. If Harper's prompt text must change to use the learnings, show the exact current text and the reason, for approval.
8. Verify these defects against today's code. For each, state whether it can still occur, cite the code, and if it can, plan the root-cause fix:
   a. Requirement ratings and "Why you want to work at this company" rendered twice on Harper's page.
   b. A company mission statement from the posting turned into a Harper question.
   c. The seeker's reply echoed back as a result (for example the draft resume bullet "Clarified that a company statement needed to be reframed as an interview question."), which violates the rule that the seeker's raw reply is never shown as Harper's result.
   d. An orphan question with no context ("Tell me what happened, what you did, and what the result was.").
   e. Near-duplicate questions not caught (two career walk-through questions, Merion to OpenText and Aerotek to OpenText): why questionNearDuplicate missed them.
   Do not change Harper's prompt text in the plan; if a fix needs prompt text, show the exact current text and the reason, for approval.
9. Cost and jobs: confirm no step in this plan triggers a paid call or a job that did not run before, except the decision 7 planning run on a real change, and that serialization and the reply wait apply to every Harper section.
10. Every file and function affected, and what each becomes. Schema changes, or "none", and why they are safe.
11. Size: estimate whether this is one change or should be split, and propose the split so each part is independently testable.

TESTS
Do not run or write tests. List the tests the implementation would add, each with what it asserts. Include: questions and answers appear only on Harper's page; no employer fit appears on Harper's page; Stage shows no Q&A and Add Persona navigates to the interviewer's Harper section; cheat sheet edit links reach the exact Harper question; the cheat sheet renders from Harper's answers with no regeneration; "Where you stand" renders once; evidence and replies are links; the edit box appears only after clicking Edit; a new learning adds or adjusts open questions for the right interviewer and never changes approved answers; unchanged learnings trigger no planning run; learnings never re-run the job parse, requirement ratings, resume, or cover letter; the reply wait and drain work in every Harper section; each defect in item 8 that could still occur is prevented.

REPORT
Deliver the plan in sections numbered 1 through 11 matching the items above, followed by the TESTS list. End with a short list of risks or unknowns. Make no code changes.
