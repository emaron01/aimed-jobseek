Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Implement Batch A of the approved plan docs/prompts/harper-single-qa-surface-plan-report.md. Fix at the root; no output filtering, no temporary fixes, no data repair, no migrations, no schema changes.

SURGICAL RULE
Batch A only: Harper page layout and controls. Do not change Stage, the Cheat Sheet, Harper's prompt text, question planning, learnings, role-expertise generation, the Phase 1 gate, serialization, or any paid call. Rendering must never enqueue a job or make a paid call. Do not add a placeholder for role-expertise questions (that is Batch D). Add no features.

BATCH A
1. Fixed order on Harper's page:
   a. Where you stand, shown once, at the top: the requirement summary (for example "Strong 8, Partial 3, None 0") and each requirement's rating with its reason and "Expand evidence". Display only.
   b. General questions.
   c. One section per interviewer, in interview-date order from Stage, open questions first, then answered.
2. Anchors: every interviewer section and every question gets a stable anchor (as planned, for example #harper-contact:{id} and a per-question anchor) so Batch B can link to them. Anchors use ids only in the URL fragment; no id is shown as text.
3. Where you stand becomes display-only: remove its "Share some details" answer forms.
   - REQUIRED CHECK: every requirement shown as open or Partial in Where you stand must remain answerable through a question in General questions or an interviewer section. Report how each open gap maps to an answerable question in the code.
   - If any open gap would have no answerable question after the forms are removed, STOP: do not remove the forms. Report the gaps with no question and how the code creates gap questions, for approval.
4. Defect 8a: requirement ratings and "Why you want to work at this company" each render exactly once on the page.
5. Controls:
   - "Expand evidence" and "Show your replies" are text links, not buttons.
   - "Add another reply" is replaced by an "Edit" link. The edit box appears only after the seeker clicks Edit.
   - The existing behavior that hides or disables reply forms while Harper is analyzing stays exactly as it is, and applies to every section.

TESTS
Add automated tests that assert:
- Harper's page renders Where you stand once at the top, then General questions, then interviewer sections in interview-date order with open questions first.
- Where you stand has no answer forms, and every open or Partial requirement has an answerable question elsewhere on the page.
- Requirement ratings and "Why you want to work at this company" each render once.
- Every interviewer section and question has its anchor, and no id appears as visible text.
- "Expand evidence" and "Show your replies" render as links, not buttons.
- "Add another reply" no longer renders; "Edit" renders, and the edit box appears only after clicking Edit.
- Reply forms are hidden or disabled while Harper is analyzing, in every section.
- Rendering Harper's page enqueues no job and makes no paid call (extend the no-ai-on-view tests).
Run the full existing test suite, including real-Postgres tests, and confirm it passes with no new failures. Never change an existing test only to make it pass; report any test changed and why.

REPORT
1. The open-gap to question mapping from item 3, and whether you continued or stopped.
2. What changed for each Batch A item, with file and line.
3. The anchor format implemented.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test, and the full test suite result, confirming the real-Postgres tests ran.
6. Confirmation that Stage, the Cheat Sheet, prompts, planning, learnings, and paid calls are unchanged.
