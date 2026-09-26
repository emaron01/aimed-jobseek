SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Remove every remaining content gate, and change Harper to draft up to 10 questions that the seeker answers one by one. Work on main. Commit and push when all checks pass. Change nothing else.

PRODUCTION LOG (one Harper turn took 130 seconds and appeared frozen):
{"event":"generation_quality_rejected","generator":"consultation.plan","attempt":0,"check":"internal_state","field":"assessments.8.strategy","text":"Lead with the OpenText revenue build and explain which parts came from new logos, product-line revitalization, cross-sell, or existing-account growth where applicable. CSC needs confidence that you can manage both motions with separate operating signals."}
{"event":"generation_quality_rejected","generator":"consultation.plan","attempt":1,"check":"question_item","field":"questions.mission:sc_8af63853","text":"A usable question was not written for this requirement, so it was left for a later round."}
{"event":"consultation_coach_failed","message":"Consultation structured output failed validation after normalization.","cause":"Consultation structured output failed validation after normalization."}
[research-worker] application job cmuif4bxj0001n92n6bafb14e type=CONSULTATION application=cmuh9a2w5005lko2nzbo1g6qt durationMs=129562 outcome=succeeded

PART 1: Remove every content gate
1. Remove every remaining check on generated content, in every generator, including the internal_state and question_item checks in consultation planning and any other quality, perspective, grounding, or verification check. Only unparseable model output may be retried.
2. A job that fails must be recorded as failed and shown to the seeker with a Retry, never logged as succeeded. In the log above, the coach failed but the job logged outcome=succeeded, and Harper appeared frozen.
3. List every check removed.

PART 2: Harper drafts her questions up front
1. Harper drafts up to 10 questions for the application in one step.
2. The questions are listed on the Harper page. Each question is collapsible: collapsed shows the question; expanded shows the answer box, or, once answered, Harper's final statement.
3. The seeker can answer the questions in any order. After the seeker answers, Harper may ask at most one follow-up if she needs more information, then produces the final statement: the resume bullet and the talking point (interview answer). They must be simple, elegant, and useful.
4. Each final statement has Approve and Regenerate. The seeker's own answer is stored and collapsed under the question so it can be looked up.
5. Answering a question does not redraft the other questions or recompute "Where you stand" on every answer.
6. "Where you stand" and its evidence stay as they are, below the questions. No navigation buttons at the top of the Harper page.

TESTS
- No content check can reject or retry generated output; only unparseable output retries.
- A failed job is recorded as failed and shows Retry.
- Harper drafts at most 10 questions in one step; each is collapsible.
- Answering produces at most one follow-up, then a resume bullet and a talking point with Approve and Regenerate.
- Answering one question does not redraft the others.

REPORT
Every check removed, the time from saving an answer to the final statement appearing (measured locally with the worker running), a screenshot of the Harper page with several questions, one answered, files changed, and a full-suite result.
