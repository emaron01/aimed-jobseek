# Prompt: Audit AI model calls — triggers, reuse, caching, cost

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

REPORT ONLY. Do not change any code, configuration, schema, prompts, or data.

TASK: Audit every AI model call in the product for what triggers it and whether it repeats work already done.

1. List every AI call (operation, model role, and the model it resolves to in production configuration). For each: what triggers it (seeker action, page load or view, background job, worker startup, or a chain from another job), and the exact code path.
2. Flag every AI call that can run when the seeker only views a page or opens a section, without taking an action. Include the workspace "ensure" routines (next-step card, identity checks, hiring-team merge, and any others).
3. Reuse and duplication:
   a. Company research: is there a reuse window (Aimed Outreach reuses company research for 90 days)? Does an application for a company already researched reuse it, or research again? Is research shared across organizations, or repeated per organization?
   b. Job parsing, persona identification, persona builds, interviewer profiles, Harper assessments, resume and cover letter, and cheat sheet sections: under what conditions does each regenerate, and can any regenerate when its inputs have not changed?
   c. When a second person is added to a persona that is already built, confirm the general persona is not rebuilt: only that person's individual profile and their own cheat sheet section are generated. Report every path (adding a person, pasting their profile, editing a contact, adding stage notes) that could rebuild the general persona or regenerate another person's cheat sheet section, and whether its inputs actually changed.
4. Prompt caching: for each high-cost operation, whether its payload is ordered so repeated context is cached, and why production shows 99,034 cached input tokens against 731,455 cache writes.
5. For one full application (research, personas, Harper session, resume and cover letter, and one interviewer's cheat sheet), estimate the number of AI calls and the cost per step, using the production model rates.

Conclude with every call that repeats work or runs on a view, and the savings available from: research reuse (within an organization and across organizations), removing view-triggered calls, preventing regeneration when inputs have not changed, and moving operations to the cheaper model. Do not implement anything.
