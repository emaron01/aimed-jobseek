Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
All findings must be based on the actual code as it exists now. Cite file paths, function names, and line numbers for every claim. No guesses; if something cannot be determined from the code, say so explicitly. Plans must fix root causes; no patches, no data repair, no migrations of existing data.
SURGICAL RULE
PLAN ONLY. Do not change any code, configuration, schema, prompts, tests, or data. Write the plan addendum and stop. Coding starts only after the product owner approves it.
CONTEXT
This is an addendum to docs/prompts/harper-single-qa-surface-plan-report.md. Update that plan with the decisions below and return the requested sections in full.
PRODUCT OWNER DECISIONS
1. Learnings default to the Hiring Manager. The job description is written for the hiring manager, so what the seeker learned (learned notes and interview stage notes) is applied to the Hiring Manager's section on Harper's page by default. Harper may also use the learnings as background when preparing other interviewers' sections. No new association field, seeker input, or schema.
2. Learnings re-plan only on a real change. The existing reassess triggered by learnings is currently unguarded. It must run only when the learnings actually change (fingerprint under the Phase 1 gate pattern), serialized, additive (never changes approved answers), never on a page view.
3. Role-expertise questions. Harper's General questions section includes the top questions a hiring manager for this specific role would ask (for example, what a strong hotel manager or sales director is expected to know).
   - Each question gets a Harper-drafted answer built from the seeker's Personal Profile.
   - The seeker can reply to any of these questions to fill gaps the profile does not cover, and Harper curates the reply into a polished answer, using the existing Harper reply, polish, and approve flow (record-before-enqueue, consultation drain, reply waits for Harper, Edit link).
   - Generating the question set is one paid run per application, cached, re-running only when the job itself changes. Reuse existing generation where it exists before adding anything new.
PLAN FOR
1. Decision 1: how the Hiring Manager section is identified (the Hiring Manager role or persona, and what happens if none is identified or built yet), and how learnings reach its question planning and the other sections as background. If Harper's prompt text must change, show the exact current text and the reason, for approval.
2. Decision 2: the reassess trigger today (cite it), the fingerprint inputs, and how it becomes gated, serialized, and additive.
3. Decision 3:
   a. The existing "Likely questions" with sample answers in the cheat sheet (and any similar generation in Harper): what produces it, its inputs, whether it is per interviewer, whether it can produce the role-level general set, and its cost.
   b. Plan the role-expertise questions reusing it if possible; if new generation is required, say so, with its fingerprint (job inputs only), where it is stored, when it runs (on a seeker action or after the job parse, never on page view), and how it avoids duplicating per-interviewer likely questions.
   c. How the Harper-drafted answer from the Personal Profile is produced (in the same run or separately), its fingerprint, and whether it re-runs when the profile changes.
   d. How these questions plug into the existing reply, polish, and approve flow so seeker replies fill gaps and are curated exactly like other Harper questions, and how they reach the cheat sheet.
   Do not write prompt text; if new prompt text is needed, say so for approval. Do not choose the number of questions; the product owner will.
4. Return in full from the plan: the batch list A through D with exactly what each batch contains, section 7 (learnings into Harper) updated with decisions 1 and 2, and section 8 (the five defects) with whether each can still occur and its planned fix.
5. Update the affected files, cost confirmation, and batch split for these decisions.
TESTS
Do not run or write tests. List the tests these decisions would add, each with what it asserts. Include: learnings apply to the Hiring Manager section by default; unchanged learnings trigger no reassess or planning run; a real learning change triggers one serialized, additive run that never changes approved answers; role-expertise questions appear in General questions with a Harper-drafted answer, run once per application, and do not re-run unless the job changes; a seeker reply to a role-expertise question is curated through the existing flow and reaches the cheat sheet; no page view triggers any of these runs.
REPORT
Deliver sections 1 through 5 matching the items above, followed by the TESTS list and a short list of risks or unknowns. Save the updated plan to docs/prompts/harper-single-qa-surface-plan-report.md. Make no code changes.
