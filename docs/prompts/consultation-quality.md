# Raise consultation quality to the standard of an experienced recruiter

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

Read docs/product-vision.md before starting.

TASK: Raise consultation quality to the standard of an experienced recruiter. The model reasons; product code enforces guardrails. Work on main. Commit and push when all checks pass.

PROBLEM
The current consultation is mechanical: product code writes the questions ("Tell a story about '5 years of Python'"), evidence is matched by keyword ("Leads incident response" is STRONG while "make warehouse robots reliable" is NONE, although incident response is reliability work), years-of-experience requirements are not calculated, a mission statement is treated as a skill gap, STAR stories are split by sentence position, and competencies link only on keyword mentions. First, report which consultation text is currently written by product code rather than the model, as was found for Hiring Team personas. Remove any product code that writes consultation narrative, questions, strategies, or assessments.

REQUIRED BEHAVIOR
1. Evidence assessment by reasoning, with enforced grounding
- The model assesses each scorecard item and requirement semantically: related, adjacent, and transferable experience counts, with an explanation of the connection.
- Every STRONG or PARTIAL assessment must cite specific Personal Profile FACT item ids. Product code verifies each cited id exists and is FACT; an assessment citing a missing or INFERENCE item is downgraded, and the downgrade is recorded.
- Years-of-experience requirements are calculated deterministically from role dates on the Personal Profile (FACT items), with the calculation shown. Overlapping roles are not double-counted. When dates are missing, say so and ask; never estimate.

2. Strategy by item type
- Skills, requirements, and competencies: prove with a story, reframe adjacent experience, or acknowledge honestly.
- Mission: connect the seeker's relevant experience and motivation to the mission.
- Outcomes: show evidence of delivering comparable outcomes.
The model writes a short, specific strategy for each item, referring to the seeker's actual experience.

3. Questions written by the model
- The model writes each question the way an experienced recruiter would: specific to the seeker's background and this job, referencing their actual roles and experience, conversational, one clear ask per question.
- For example: "Your payments service work at Northwind sounds like production ownership. Walk me through a release you shipped there: what was at stake, what you did, and how it turned out?"
- Product code keeps the guardrails: prioritization (required before preferred, outcomes and competencies before minor items), questions per round, never re-asking a covered gap, and chronological walk-through questions from the Who method where seniority warrants them.
- Follow-ups are model-written and target the specific missing STAR element, especially a missing Result or metric, in natural language.
- When model generation fails, show a clear status with a retry action. Never substitute code-written questions.

4. Extraction by the model, verified against the seeker's words
- The model segments each answer into STAR parts, proposes FACT items, and proposes the competencies and requirements each story demonstrates, including semantic links (reliability work demonstrates reliability even if the word is not used).
- Product code verifies that every proposed fact and metric is supported by the seeker's verbatim answer; unsupported proposals are dropped and recorded.
- The seeker confirms or edits every proposal before it is written, as today.

5. Stance
Keep the stance in src/lib/prompt-content/consultation.ts: a coach, not an interrogator; honest and calibrated; never inflates fit; names gaps constructively and helps close them. The consultant never mentions internal system state (research status, confidence, missing data). Bump the prompt version.

TESTS
- The fixture's incident response experience produces at least PARTIAL evidence for the reliability mission, with an explanation.
- Years of Python are calculated from role dates, overlaps are not double-counted, and missing dates produce a question instead of an estimate.
- Assessments citing nonexistent or INFERENCE items are downgraded.
- No product code produces question, strategy, or assessment text.
- Follow-ups target the specific missing STAR element.
- Unsupported extracted facts are dropped.
- Semantic competency links are proposed and require confirmation.
- Covered gaps are never re-asked.

REPORT
All sample output must come from real model calls, not fixtures or test doubles. First, which consultation text was code-written and what was removed. Then a full sample consultation with the fixture resume and normal fixture posting: evidence assessment with explanations and strategies, the years-of-experience calculation, the first round of questions, a follow-up, and extracted proposals. Also prompt versions, files changed, and anything that could not meet this standard.
