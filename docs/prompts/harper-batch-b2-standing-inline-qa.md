Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Implement Batch B2 of the approved plan docs/prompts/harper-prep-hub-plan-report.md with the decisions below, which override the plan where they differ. Fix at the root; no output filtering, no temporary fixes, no data repair, no migrations, no schema changes.

SURGICAL RULE
Batch B2 only: Harper's default view, Where you stand, with every question and answer shown inline in context. Do not change Stage, the Outreach page, the Cheat Sheet page, the person view or search (Batch B3), Harper's prompts or planning, learnings, the Phase 1 gate, serialization, or any paid call. Rendering must never enqueue a job or make a paid call. Add no features.

PRODUCT OWNER DECISIONS
1. Where you stand is Harper's default view and the general interview prep that drives everything else. It keeps its summary (for example "Strong 8, Partial 3, None 0") and each requirement's rating with its reason, as Batch A left them.
2. No free-floating questions. Every question and answer currently in the General thread is shown inline under the Where you stand topic it belongs to:
   - A gap question and its answers appear under that requirement.
   - General questions not tied to one requirement (for example "Why you want to work at this company" and the career walk-through) appear under Where you stand as their own topics.
   - Questions that belong to a specific interviewer stay with that interviewer (the person view is Batch B3; until then, keep them where Batch A shows them).
   Report the mapping of every current General question to its topic. If any question has no clear topic, report it; do not create an "Other" section.
3. Answers tied to a gap display under that gap. Do not build handling for orphaned answers; if the mapping finds answers not tied to any question or gap, report them only (the product owner will verify on a fresh account).
4. Batch A behavior carries over inline: Answer links become unnecessary where the question is now shown under its own topic; "Share some details" stays for gaps with no question; the "Ignore" button and "Ignored" text link work as decided; "Expand evidence" and "Show your replies" are text links; "Edit" shows the edit box only after it is clicked; reply forms stay hidden or disabled while Harper is analyzing.
5. Anchors keep working: #harper-standing, and #harper-q:{questionTurnId} goes to the question at its new inline position. Report any anchor whose target changed.
6. Leave a clear place under Where you stand for Batch D's role-expertise questions, with no placeholder text or empty section rendered.

TESTS
Add automated tests that assert:
- Where you stand renders as the default view with its summary and ratings.
- No General thread of free-floating questions renders; every former General question renders inline under its topic.
- "Why you want to work at this company" and the career walk-through render as topics under Where you stand, each once.
- Gap answers render under their gap.
- "Share some details", "Ignore", "Ignored", "Expand evidence", "Show your replies", and "Edit" behave as Batch A decided, inline.
- #harper-q:{questionTurnId} resolves to the inline question.
- Reply forms are hidden or disabled while Harper is analyzing.
- Rendering enqueues no job and makes no paid call (extend the no-ai-on-view tests).
Run the full existing test suite, including real-Postgres tests, and confirm it passes with no new failures. Never change an existing test only to make it pass; report any test changed and why.

REPORT
1. The mapping of every former General question to its Where you stand topic, and any question with no clear topic.
2. Any answers found not tied to a question or gap (report only).
3. What changed, with file and line.
4. Any anchor whose target changed.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test, and the full test suite result, confirming the real-Postgres tests ran.
7. Confirmation that Stage, Outreach, the Cheat Sheet page, prompts, planning, learnings, and paid calls are unchanged.
