SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Implement Batch B3 of the approved plan docs/prompts/harper-prep-hub-plan-report.md with the decisions below, which override the plan where they differ. Fix at the root; no output filtering, no temporary fixes, no data repair, no migrations, no schema changes. Never silence type or lint errors.

SURGICAL RULE
Batch B3 only: overview gap placement, Harper's person view and search, Add Interview Contact, a Harper path to start prep for any interviewer, and making "Use this interviewer" on Stage assign-only. Do not change the Cheat Sheet page (Batch B4), the Outreach page, Harper's prompts or planning, learnings, the Phase 1 gate, serialization, or any paid call beyond reusing existing seeker-action build paths. Rendering must never enqueue a job or make a paid call. Add no features.

PRODUCT OWNER DECISIONS
1. Overview gaps: cheatSheet:overview:gap:{n} items (cheat-sheet company-level gaps; every persona is at the same company, so these are general prep) render under Where you stand as their own topics, labeled with the stored question text and no rating, the same treatment as a dropped requirement. They count in the B2 render invariant. Legacy cheatSheet:role:* items and items with no target key get no new code (old data; verified on a fresh account).
2. Search on Harper: "Find a person or Hiring Team role" (the search on the Cheat Sheet page today) is added to Harper's page. Where you stand stays the default view.
3. Person view on Harper: selecting a person or role opens that person's full profile inline on Harper, with the same content and order the Cheat Sheet shows for a person today (what they care about, how your experience connects, how to position yourself, key statements, likely questions), and with that person's questions, answers, and replies inline in that context (person-prep and contact-linked cheatSheet items). Reuse the existing Cheat Sheet person rendering where possible, so the content matches.
4. Interviewer cards on Harper (for example "Prep for this interviewer: Christina Schivley") stay and link to that person's inline profile. #harper-contact:{contactId} opens that person's inline profile.
5. "Add Interview Contact" on Harper: the seeker adds a person they expect to interview with, before any interview is scheduled, using the existing contact creation and the existing prep and build paths (contact profile, persona build, person prep) as a seeker action. A contact added here is available to "Use this interviewer" on Stage once an interview is scheduled.
6. Start prep on Harper: in a person's inline profile, when their prep has not been started, show the existing control that starts it (the existing offerPersonPrep and cheat-sheet section paths), with its existing label. Report the label used. This is how prep starts for an existing contact from now on.
7. "Use this interviewer" on Stage becomes assign-only: it assigns the selected person to the interview and starts no prep, no cheat-sheet section, no persona build, and no contact profile. Prep for that person is started on Harper (decision 6).
8. No new paid calls beyond these existing seeker actions. The Phase 1 gate, serialization, the consultation drain, and "reply waits for Harper" apply in the person view. Use existing labels; where new wording is needed, say where, and the product owner will supply it.

TESTS
Add automated tests that assert:
- Overview gap items render under Where you stand with their question text and no rating, and count in the render invariant.
- Harper renders the "Find a person or Hiring Team role" search, with Where you stand as the default view.
- Selecting a person opens their full inline profile with the same content and order as the Cheat Sheet person view, and their questions, answers, and replies inline.
- Interviewer cards and #harper-contact:{contactId} open that person's inline profile.
- "Add Interview Contact" creates the contact and starts prep through the existing paths, and the contact is then available to "Use this interviewer" on Stage.
- The start-prep control appears only when prep has not been started, and uses the existing path.
- "Use this interviewer" assigns only and enqueues no prep, cheat-sheet section, persona build, or contact profile.
- Reply forms are hidden or disabled while Harper is analyzing in the person view.
- The B2 render invariant still holds; every item with seeker content or an open question renders exactly once.
- Rendering Harper's page and the person view enqueues no job and makes no paid call.
Run the full existing test suite, including real-Postgres tests. Also run the exact production build (the same command Render runs), the full type check, and lint if the build runs it. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit the work on branch checkpoint/harper-prep-hub (update it from main first) with a message naming Harper Batch B3, and push that branch. Do not merge into main or push main.

REPORT
1. What changed for each decision, with file and line.
2. The existing paths reused by Add Interview Contact and start prep, and what each costs.
3. The existing label used for the start-prep control, and any place new wording is needed.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; the full test suite result, confirming the real-Postgres tests ran; and the production build, type check, and lint results.
6. The commit hash and branch pushed.
7. Confirmation that the Cheat Sheet page, Outreach, prompts, planning, learnings, and paid calls are unchanged beyond the listed existing seeker actions.
