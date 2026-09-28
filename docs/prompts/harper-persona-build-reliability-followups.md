# FOLLOW-UPS — Persona build reliability (ITEMS 1–4)

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root cause. Never change a test only to make it pass. No temporary fixes, no data repair, no migrations, no schema changes.

SURGICAL RULE
Change only what ITEMS 1 to 4 require. Do not change prompt text, models, the quality check rules (unless ITEM 1 stops for approval), chip text, serialization, the Phase 1 gate, or anything else. Add no features.

CONTEXT
The persona build reliability implementation (docs/prompts/harper-persona-build-reliability-implement-report.md) is accepted except for the four items below.

ITEM 1: Validate the quality check against a real, complete persona.
Add a test fixture built from the real general persona below (a built "Executive Leadership" role for a Senior Director of Sales - North America posting at CSC). Map each section to the fields the persona narrative uses (overview, pressures, needs, concerns, interview stage, evaluates, talking points, communication, why identified). Run assessHiringTeamDraft on it.
- If it passes, add a test asserting that this complete persona passes the quality check.
- If it is rejected, STOP: do not change the quality check or anything else for this item. Report the rejection reasons and the exact rules that rejected it, for approval.

Persona content (use as fixture text):
Overview: This leader turns CSC's North America sales strategy into a measurable operating system: clear account priorities, consistent deal inspection, usable CRM data, and a forecast that executives can act on. Their desk is where pipeline health, methodology adoption, seller productivity, expansion visibility, and manager operating discipline come together across domain security, digital brand protection, and related cyber-risk services.
Impact: A strong Senior Director of Sales would give this leader cleaner pipeline inputs, more credible forecast calls, and better manager-level adherence to qualification and inspection standards. That reduces the time spent reconciling conflicting deal views and lets Revenue Operations focus on improving conversion, coverage, seller productivity, and expansion visibility across CSC's North America business.
Pressures: (1) CSC sells a broad set of technology-enabled and managed services, so this leader must help sales teams separate attractive activity from qualified demand in complex enterprise buying cycles. (2) The North America sales organization is expected to grow both new-logo revenue and expansion revenue without losing control of forecast quality or seller focus. (3) Digital brand protection and domain-security opportunities may involve security, legal, marketing, procurement, and risk stakeholders, making stage progression and deal qualification difficult to standardize. (4) Leadership needs a repeatable commercial cadence that works across CSC's established service businesses and evolving cyber-risk offerings. (5) A hybrid, distributed organization increases the importance of shared definitions, timely CRM updates, and operating routines that do not depend on hallway visibility.
Needs: (1) In the first month, establish a shared view of North America pipeline health, forecast risk, account coverage, and expansion visibility with the Revenue Operations leader. (2) Make deal reviews more evidence-based by consistently documenting qualification, stakeholder access, business impact, next steps, and reasons for stage movement. (3) Create a dependable working rhythm with managers for pipeline inspection, forecast updates, and rapid escalation of stalled or strategically important opportunities. (4) Improve CRM signal quality by adopting the agreed fields, stages, and inspection habits rather than creating parallel spreadsheets or informal forecasts. (5) Identify the largest gaps between reported pipeline and likely revenue across new-logo and expansion motions, then act on those gaps with specific manager and seller interventions. (6) Demonstrate measurable progress in coverage, forecast confidence, qualification quality, or cycle-time reduction within the first operating quarter.
Concerns: (1) Can this person operate within a metrics-driven cadence when the data exposes weaknesses in their team or individual deals? (2) Will they treat CRM updates and qualification evidence as part of selling discipline, or delegate them as back-office administration? (3) Do they understand complex cyber-risk and digital-brand buying committees well enough to distinguish real progress from polite stakeholder activity? (4) Can they coach frontline managers to change behavior, or do they depend on Revenue Operations to enforce process from outside the sales team? (5) Will they balance the urgency of new-logo pursuits with disciplined expansion planning across CSC's established customer base? (6) Can they explain business impact from operating changes rather than listing activity, training delivered, or tools implemented?
Interview stage: hiring manager chronological walk-through
Evaluates: (1) How the candidate has built and sustained forecast discipline in complex enterprise sales environments. (2) Whether the candidate can apply MEDDIC or a similar methodology through real manager and seller behavior. (3) Evidence of improving pipeline coverage, win rates, cycle time, quota attainment, seller productivity, or retention. (4) Ability to work with Revenue Operations on CRM adoption, data quality, definitions, and operating cadence. (5) Judgment in balancing new-logo acquisition, customer expansion, account prioritization, and cross-functional dependencies. (6) The candidate's ability to make risks visible early and respond constructively to inspection and performance data.
Talking points: (1) Explain how you established one definition of a qualified opportunity and made managers use it in weekly deal reviews. (2) Describe a forecast that was unreliable, the signals you found beneath the reported number, and the operating changes that improved accuracy. (3) Show how you used account segmentation or ICP analysis to redirect seller time toward high-value enterprise opportunities rather than simply increasing activity. (4) Give an example of making MEDDIC or a comparable framework useful in live deal coaching, including what evidence you required before advancing a stage. (5) Discuss how you partnered with frontline managers to improve CRM adoption without turning the process into an administrative exercise. (6) Connect seller productivity, retention, quota attainment, and expansion outcomes to the specific leading indicators you monitored. (7) Explain how you would work day to day with Revenue Operations: agree on definitions, inspect evidence, close data gaps, and turn findings into manager actions.
Communication: (1) Lead with specific operating examples and measurable before-and-after outcomes rather than broad claims about leadership. (2) Be candid about forecast misses, adoption resistance, or process failures and explain the corrective actions taken. (3) Use the language of evidence: what was in the CRM, what changed in the forecast, which behavior changed, and what result followed. (4) Explain collaboration with Revenue Operations as a working partnership involving shared definitions, recurring inspections, and rapid feedback loops. (5) Keep answers structured and concise enough to map to an operating review, while showing the judgment behind the metrics.
Why identified: (1) The role owns North America revenue targets across expansion and new-logo acquisition. (2) CSC offers digital brand and cyber-risk services, including DNS management, digital-brand protection, and fraud protection. (3) The role is responsible for building a disciplined, world-class sales organization and sustainable growth.

ITEM 2: Configuration detection.
- Report the exact seeker-facing message text shown by queueHiringTeamBuild when persona synthesis is not configured, and where it renders.
- Report whether any startup, deploy, or health check detects a missing persona synthesis configuration before a seeker acts, using existing mechanisms. If none exists, add detection using the existing startup or health-check mechanism (as your plan's configuration section described) so a missing configuration is logged as an operational error at web and worker startup. Do not add new infrastructure.
- The seeker-facing message must contain no system language (no "configured", "synthesis", "provider", or error codes). If it does, report the current text and stop for the product owner to supply wording; do not write new wording.

ITEM 3: Edit marks only the edited role stale.
Confirm with code and a test that editing one built role marks only that role stale and never marks any other role stale. If it can mark any other role stale, fix it at the root.

ITEM 4: The identity-queue test change.
Report what the identity-queue test asserted before and after it was changed to use isRetryableProviderMessage, and why. If the change altered what the test verifies about identity queue behavior, restore the original assertion and fix the code instead.

TESTS
Add or update automated tests for: ITEM 1 (the complete persona passes, if it does); ITEM 2 (missing configuration is detected at startup, and the seeker message contains no system language); ITEM 3 (editing one role never marks another stale). Run the full existing test suite, including real-Postgres tests, and confirm it passes with no new failures.

REPORT
1. ITEM 1 result.
2. ITEM 2: the message text, where detection happens, and what changed.
3. ITEM 3 result and any fix.
4. ITEM 4 before and after, and whether anything was restored.
5. Every file changed.
6. Tests added or changed and the full test suite result, confirming the real-Postgres tests ran.
7. Confirmation that nothing outside ITEMS 1 to 4 changed.
