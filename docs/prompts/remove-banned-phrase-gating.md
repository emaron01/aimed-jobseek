Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Harper output is rejected by our own quality checks in production. Remove the banned-phrase gating and stop partial failures from failing whole responses. Work on main. Commit and push when all checks pass.

PRODUCTION LOG
{"event":"consultation_generation_failed","sessionId":"cmuhb2flk0009s52q1isgmqyj","message":"Consultation output did not pass quality checks. Retry consultation."}
The seeker saw "Harper could not write this coaching. Retry when the consultation model is available." That message is wrong: the model is available; the output was rejected by our own checks. The posting (Director of Enterprise Sales) contains "fast-paced", "dynamic environment", "results-driven", and "proven track record", which are on the banned-phrase list.

REQUIRED
1. Logging: for every rejected attempt in every generator, log which check failed, on which field, and the offending text (trimmed).

2. Remove the banned-phrase list and every check, rejection, and retry based on it, for all generators. Natural, human-sounding writing is handled by prompting and voice instead:
- Every customer-facing generator (resume, cover letter, emails, LinkedIn messages and posts) is instructed to write the way the seeker writes, in plain professional language, avoiding phrasing that reads as AI-generated.
- Use the seeker's voice samples and their own words from Harper conversations whenever available.
- The only automatic step: in customer-facing output, replace em dashes with appropriate punctuation. This is a silent cleanup, never a rejection or retry.
- Harper's coaching, briefing, questions, assessments, interview guides, personas, and the Application Summary have no phrase restrictions.

3. Never fail a whole response because one part failed. Keep the parts that pass validation, regenerate only the failing part, and if that still fails, show the passing parts plus a plain note and a retry for the missing part.

4. Error messages are accurate and plain. Never say the model is unavailable unless the model call itself failed.

5. Review the remaining quality checks (repetition, meta-language, claim grounding, and others) and apply the same principle: a check that fails asks the model to fix the specific sentence or field, rather than rejecting the whole output. Claim grounding for customer-facing output stays strict: an untraceable claim is removed or rewritten, never saved.

6. Reproduce with a real-scale profile (at least nine roles and a dozen achievements) against a Director of Enterprise Sales posting containing those phrases, with the worker running. Watch Harper's briefing and first question render without a reload, and a resume and cover letter generate, before reporting done.

REPORT
The check that rejected the production output, what was removed, how partial failures now behave, the checks that now fix instead of reject, real model output from the reproduction (Harper's briefing and first question, and the first paragraph of the cover letter), attempt counts, files changed, and a full-suite result.
