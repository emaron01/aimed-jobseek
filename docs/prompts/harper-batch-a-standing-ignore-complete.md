Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no output filtering, no temporary fixes, no data repair, no migrations, no schema changes.

SURGICAL RULE
Complete Batch A of docs/prompts/harper-single-qa-surface-plan-report.md with the product owner decisions below. Do not change Stage, the Cheat Sheet, Harper's prompt text (see the STOP in item 1), learnings, the Phase 1 gate, serialization, or any other paid call. Rendering must never enqueue a job or make a paid call. Add no features.

CONTEXT
Batch A (docs/prompts/harper-batch-a-implement.md) correctly stopped on removing the "Share some details" forms, because open gaps can have no answerable question: the gap-question cap is 10, and an ignored question leaves its gap open with no question card.

PRODUCT OWNER DECISIONS
1. Gap-question cap: raise the maximum from 10 to 25. It is a maximum, not a target; Harper asks only as many questions as the gaps need. Report where the cap lives. If the cap or the number appears in any prompt text sent to the model, STOP on this item only: report the exact text for approval and do not change it.
2. Where you stand, per open gap:
   a. The gap has an answerable question: no form; show a text link "Answer" that goes to that question's anchor (#harper-q:{questionTurnId}).
   b. The gap has no question: keep "Share some details", and show an "Ignore" button.
   c. The gap was ignored (its question was ignored, or the seeker ignored it here): show "Ignored" as a text link, with no form and no question. Clicking "Ignored" reopens the gap: its original question returns as an open question if it had one, otherwise the gap returns to 2b. Reopening makes no paid call and generates no new question. Use the existing ignore and un-ignore handling if it exists; report what exists and what you added.
3. On all of Harper's page (questions and Where you stand): "Ignore" is a button, because ignoring is a deliberate choice. Once a question or gap is ignored, the button is replaced at that same place by an "Ignored" text link that reopens it as in 2c.
4. The rule "an ignored question is never asked again" still holds unless the seeker reopens it with the "Ignored" link.

TESTS
Add automated tests that assert:
- The gap-question cap is 25; a job with fewer gaps gets only as many questions as gaps.
- A gap with a question shows the "Answer" link to its anchor and no form.
- A gap with no question shows "Share some details" and an "Ignore" button.
- Ignoring a question or gap replaces the "Ignore" button with an "Ignored" text link at the same place, with no form and no question.
- Clicking "Ignored" restores the original question as open (or 2b if none) with no paid call and no new question.
- An ignored question is never re-asked by planning unless reopened.
- Every open requirement in Where you stand has an answer path (an "Answer" link or "Share some details") unless ignored.
- Rendering, ignoring, and reopening enqueue no paid job.
Run the full existing test suite, including real-Postgres tests, and confirm it passes with no new failures. Never change an existing test only to make it pass; report any test changed and why.

REPORT
1. Where the cap lived and what changed, or the prompt text awaiting approval.
2. What changed for each decision, with file and line, including existing versus added ignore and un-ignore handling.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test, and the full test suite result, confirming the real-Postgres tests ran.
5. Confirmation that nothing outside these decisions changed.
