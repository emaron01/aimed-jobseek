Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no output filtering, no temporary fixes, no data repair, no migrations, no schema changes.

SURGICAL RULE
Fix only the unmapped-items gap in Batch B2 (docs/prompts/harper-batch-b2-standing-inline-qa-report.md). Do not change Stage, the Outreach page, the Cheat Sheet page, Harper's prompts or planning, learnings, the Phase 1 gate, serialization, or any paid call. Do not create an "Other" section. Rendering must never enqueue a job or make a paid call. Add no features.

CONTEXT
B2's partitionGeneralQuestionsForStanding leaves some Harper items unmapped and does not render them: cheatSheet:{itemId} items (answers given on the Cheat Sheet page and the former Stage), and any key not in the current standing requirement set. Batch B1 confirmed cheatSheet: answers appeared on Harper; B2 hid them. Answers the seeker gave must never be hidden.

RULE
Every Harper item that has a seeker answer, a statement, or an open question is rendered somewhere on Harper's page. Nothing with seeker content is hidden.

STEP 1: REPORT FIRST
1. For cheatSheet:{itemId} items: how the item maps to its interviewer (contact) from the stored data, with file and line. State whether every cheatSheet item can be tied to a contact.
2. Every other way the current code can produce an unmapped key (for example a requirement key that drops out of the standing list after a reassess, or a key renamed between prompt versions), with file and line, and whether the item can still be tied to a requirement, a dedicated topic, or an interviewer.

STEP 2: IMPLEMENT
1. cheatSheet:{itemId} items render in their interviewer's section on Harper's page (where interviewer questions render today, until Batch B3's person view), inline with that interviewer's other questions and answers.
2. A requirement key that is no longer in the current standing list, but whose item has seeker content, renders under Where you stand as its own requirement topic, using the requirement text stored on the item, without a rating. It is not dropped.
3. If STEP 1 finds any other unmapped case that cannot be placed under a requirement, a dedicated topic, or an interviewer, STOP on that case: report it with examples of how it arises, for the product owner's decision. Do not build an "Other" section.
4. Add a render-time invariant covered by tests: the set of rendered items equals the set of items with seeker content or open questions. No such item is ever left out.

TESTS
Add automated tests that assert:
- A cheatSheet:{itemId} answer renders in its interviewer's section.
- A new answer given on the Cheat Sheet page renders on Harper's page.
- A requirement key dropped from the standing list after a reassess, with a seeker answer, still renders under Where you stand with its stored text and no rating.
- Every item with seeker content or an open question renders exactly once, with no "Other" section.
- Rendering enqueues no job and makes no paid call.
Run the full existing test suite, including real-Postgres tests, and confirm it passes with no new failures. Never change an existing test only to make it pass; report any test changed and why.

REPORT
1. STEP 1 findings.
2. What changed, with file and line.
3. Any case stopped for approval.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test, and the full test suite result, confirming the real-Postgres tests ran.
6. Confirmation that nothing outside this fix changed.
