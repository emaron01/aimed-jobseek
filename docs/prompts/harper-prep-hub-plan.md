Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
All findings must be based on the actual code as it exists now, including Batch A (Harper layout order, anchors #harper-standing / #harper-general / #harper-contact:{contactId} / #harper-q:{questionTurnId}, Answer / Share some details / Ignore / Ignored), the question cap of 25 read from config, the Phase 1 paid-call guard, serialization, persona build reliability, and learned notes feeding cheat sheets. Cite file paths, function names, and line numbers for every claim. No guesses; if something cannot be determined from the code, say so explicitly. The plan must fix root causes; no patches, no data repair, no migrations of existing data.

SURGICAL RULE
PLAN ONLY. Do not change any code, configuration, schema, prompts, tests, or data. Write the plan and stop. Coding starts only after the product owner approves it. This plan replaces Batch B of docs/prompts/harper-single-qa-surface-plan-report.md. Batch A is done and carries over. Batch C (defects 8b to 8e) and Batch D (learnings gate, Hiring Manager default for learnings, role-expertise questions) remain separate and are not part of this plan, except where this plan must leave room for them.

GOAL
Harper is the one place to prepare and to answer. Stage is a timeline. Outreach holds all outreach. The Cheat Sheet is the read-only interview prep document.

PRODUCT OWNER DECISIONS
1. Stage is a timeline of who the seeker is meeting, when, and how, with each interview's existing notes (what the seeker learned). Remove every question-answering form, answer display, and outreach element from Stage.
2. Outreach: every outreach element currently on Stage, including thank-you notes and their clarifying questions, moves to the Outreach page with its existing behavior.
3. Harper is the full job prep hub:
   a. Default view: Where you stand, the general interview prep that drives everything else. Its questions and answers are shown inline, in context, under the requirement or topic they belong to.
   b. "Find a person or Hiring Team role" (the search that is on the Cheat Sheet today) moves to Harper. Selecting an interviewer opens their full profile inline, the way the Cheat Sheet shows a person today (what they care about, how your experience connects, how to position yourself, key statements, likely questions), with their questions, answers, and replies inline in that context.
   c. The interviewer cards on Harper (for example "Prep for this interviewer: Christina Schivley") stay and link to that person's full inline profile.
   d. "Add Interview Contact" on Harper: the seeker can add a person they expect to interview with before any interview is scheduled, and prep runs for them through the existing contact and persona build paths (a seeker action). Stage schedules them later.
   e. No free-floating questions. Every question lives inside a context: a Where you stand topic or an interviewer's profile. General questions (for example "Why you want to work at this company" and the career walk-through) belong under Where you stand. Leave room for Batch D's role-expertise questions under Where you stand.
4. Hiring Manager chain: every question asked and answered on Harper also appears on the Hiring Manager's profile and on the profiles of the Hiring Manager's boss(es) (the roles senior to the Hiring Manager on the hiring team), because they care about all of it. This is display only: the same answers shown in more than one profile, never regenerated or duplicated as new records, and never a second place to edit (edits go to the one question).
5. Cheat Sheet is the read-only interview prep document organized by Harper: full company profile, the interviewer, and their prep, with search, display, and print. It shows answers but never answers questions; any edit control is a text link "Edit" to that exact question on Harper (#harper-q:{questionTurnId}).
6. No new paid calls beyond existing seeker actions (Add Interview Contact uses the existing build paths). Moving or re-showing content must never regenerate anything. The Phase 1 gate, serialization, the consultation drain, and "reply waits for Harper" apply in every inline context.
7. Seeker-facing wording: use "Add Interview Contact", "Find a person or Hiring Team role", "Edit", and existing labels. Where other wording is needed, say where, and the product owner will supply it.

PLAN FOR
1. Current state: every component and data path for Stage, the Cheat Sheet (search, person view, likely questions, answer forms), Harper (Batch A layout, standing, thread), and the Outreach page, and where each question and answer is stored (including cheatSheet: turns).
2. Stage: every element removed or moved, and the resulting timeline.
3. Outreach: every outreach element moving from Stage (including thank-you notes and clarifying questions), how it moves with behavior unchanged, and anything that would break.
4. Harper default view: how Where you stand shows its questions and answers inline in context, and how every current free-floating question (General thread) maps to a Where you stand topic or an interviewer profile. List any question that has no clear context and how the plan places it.
5. Harper person view: moving the Cheat Sheet search and person view into Harper, with Q&A inline; how interviewer cards link to it; how the Batch A anchors keep working (or their replacements).
6. Add Interview Contact: the existing contact and persona build paths it uses, what it costs, and how a contact added before scheduling appears on Stage once scheduled.
7. Hiring Manager chain: how the Hiring Manager and the roles senior to them are identified from the hiring team (and what happens if none is identified), and how all answered questions are shown on those profiles as display only, with edits going to the one question.
8. Cheat Sheet: its read-only content (company profile, interviewer, prep), search, display, print, and Edit links; confirm it builds from Harper's answers with no regeneration.
9. Answers already given: confirm every previously given answer (Harper, Stage, Cheat Sheet, cheatSheet: turns) still appears in the right place and none is hidden, orphaned, or duplicated as a new record.
10. Cost and jobs: confirm no step triggers a paid call or job beyond existing seeker actions, nothing runs on a page view, and serialization and the reply wait apply in every inline context.
11. Every file and function affected, and what each becomes. Schema changes, or "none", and why they are safe.
12. Size and split: estimate the size and propose batches that are each independently testable and shippable, in order, with the Hiring Manager chain as its own batch if it is large.

TESTS
Do not run or write tests. List the tests the implementation would add, each with what it asserts. Include: Stage shows only the timeline and notes; outreach elements, including thank-you, work on the Outreach page; Harper's default view shows Where you stand with inline Q&A; selecting a person opens their full inline profile with Q&A; interviewer cards link to it; Add Interview Contact runs prep before scheduling; no free-floating questions remain; all answered questions show on the Hiring Manager chain profiles as display only, with one edit point; the Cheat Sheet is read-only with Edit links; no previously given answer is hidden, orphaned, or duplicated; no page view triggers a paid call or job; reply wait and drain work in every inline context.

REPORT
Deliver the plan in sections numbered 1 through 12 matching the items above, followed by the TESTS list. End with a short list of risks or unknowns. Save it to docs/prompts/harper-prep-hub-plan-report.md. Make no code changes.
