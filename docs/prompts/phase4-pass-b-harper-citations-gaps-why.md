# Prompt: Phase 4 Pass B — Harper citations, gap status, why-this-company

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below. Pass C comes later; do not start it. Production code only: no repair or migration of existing data.

TASK: Phase 4 Pass B: Harper (plan sections 2, 3, and 4, with the approved corrections). Work on main. Commit and push when all checks pass.

1. No internal references in Harper's text (plan section 2, corrected)
- Add the plan's prompt rule: ids appear only in structured citation fields such as supportingFactIds and relevantRoleIds, never in any prose, including explanations, overall, strongestAngles, importantGaps, commentary, questions, and coaching. In prose, name employers, titles, and outcomes in plain language.
- A response with an id in prose triggers regeneration with qualityFeedback, then is accepted after the retry limit.
- Ids are internal references, not Harper's wording, so the page never displays them: any id-shaped token (consult_, achievement_, ach_, role_, skill_, and similar) or parenthetical id list remaining in displayed Harper text is not shown. This removes only the id tokens and never changes any other word.

2. One source of truth for gap status (plan section 3)
- When Harper decides evidence, the matching assessment becomes STRONG; when she decides no_evidence, it becomes NONE; incomplete leaves it open.
- A requirement Harper has worked on shows its gap status (Open, Closed, or Confirmed gap) everywhere it appears. Requirements Harper has not worked on keep Strong, Partial, or None.

3. Why-this-company (plan section 4, corrected)
- The result is built only from the seeker's saved motivation (companyMotivation).
- Harper writes a first-person interview answer from that motivation only, for the "Why do you want to work here?" question. No resume bullet is ever written for this target.
- The gap is closed when motivation is saved.
- The cover letter and cheat sheet keep using the saved motivation.

4. Bump the consultation prompt version.

VERIFY
With the web app, the worker, and the real model on a fresh application: confirm no id appears anywhere on the Harper page; answer a gap and confirm its status matches in both lists; answer why-this-company with motivation mixed with a work story and confirm the saved motivation, the interview answer built from it, and no resume bullet.

TESTS
- The prompt contains the id rule; an id in prose triggers regeneration; ids never display, and no other text is changed.
- evidence sets STRONG and no_evidence sets NONE; a worked requirement shows the same gap status in both lists.
- A why-this-company reply produces an interview answer from the motivation only and no resume bullet; the gap closes when motivation is saved.

REPORT
What changed, the live why-this-company interview answer verbatim, confirmation that no id appears on the Harper page, files changed, and a full-suite result.
