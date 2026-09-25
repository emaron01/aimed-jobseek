Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Fix Harper defects found testing in production with a real sales leadership profile and a Senior Director of Sales posting. Work on main. Commit and push when all checks pass. Items 1 and 2 first; they block Harper.

1. "Use this" must never hang or fail because of follow-on work
Production: clicking Use this under Harper's polished interview answer and resume bullet stayed on "Saving..." with no spinner, then failed with "results could not be used". Logs:
{"event":"generation_quality_rejected","generator":"consultation.plan","attempt":0,"check":"assessment_verification","field":"assessments","text":"Consultation AI did not write a valid question for required:0."}
{"event":"consultation_coach_failed","message":"Consultation structured output failed validation after normalization.","cause":"Consultation structured output failed validation after normalization."}
{"event":"consultation_generation_failed","sessionId":"cmuhb2flk0009s52q1isgmqyj","message":"Consultation planning could not be generated. Retry consultation."}
{"event":"consultation_action_failed","message":"Consultation planning could not be generated. Retry consultation."}
- Use this commits the confirmed facts and statements with a fast write and persist. Reassessment and Harper's next question are queued follow-on work with visible status. The confirmation succeeds even if follow-on work later fails; that failure shows separately with a retry.
- Every button that calls a server action shows a spinner while pending and always ends in success or a visible error. Audit the whole application workspace.

2. Planner validation must accept partial results
- The planner rejected the entire plan because it did not write a question for required:0 (a years-of-experience requirement). Not every requirement needs a question: requirements already covered, calculated from dates, or rated Strong do not.
- Validate per item. Keep items that pass, ask the model to fix only failing items, and if an item still fails, drop it from this round and log it. Never fail the whole plan because one item failed.
- Error messages say what actually happened, in plain language.

3. Dates in the Personal Profile
The seeker's resume has month-year dates for recent roles (for example, "Dec 2022 – Present", "Apr 2015 - Dec 2021") and year-only dates for earlier roles (for example, "2002 – 2006"). Harper reported "Verified experience: 0 years (0 months)... Dates needed" for every role. The Personal Profile build lost the dates.
- Profile synthesis captures every role's dates exactly as written, month-year or year-only, as FACT. Find why they were dropped and fix it. Existing profiles whose roles lack dates are re-extracted from their stored sources, without overwriting seeker-edited fields.
- Years-of-experience calculations accept year-only dates, credited with the conservative minimum they prove (2002 – 2006 is at least 3 full years), shown as a range, never padded. A requirement is met when the conservative total meets it. Overlapping roles are not double-counted. Harper never asks for months only to do the calculation.

4. Harper's flow: close gaps first
- Before asking anything, reassess gaps by combining evidence across the whole Personal Profile. For example, expansion experience from one role plus new-logo experience from another satisfies a requirement for both; adjacent domain experience (such as selling business continuity or compliance solutions) is positioned as adjacent evidence for a risk-driven sale.
- Ask questions only about gaps that remain after combining, most important first. Do not ask about requirements already rated Strong unless the seeker chooses to.
- After the gaps, work on the seeker's high points.

5. "Where you stand": summary first
- Top: a short overall summary: how the seeker stacks up for this role, a count of Strong, Partial, and None, the gaps that matter most, and a one-sentence career recap.
- Each requirement shows its name, rating, and the one- or two-sentence explanation by default.
- The supporting evidence for each requirement is collapsed behind an "Expand evidence" / "Collapse evidence" toggle, plus Expand all / Collapse all.

6. Harper visibly thinking
When the seeker sends a message, it appears in the thread immediately, followed by a "Harper is thinking…" indicator with a spinner until Harper's reply renders in place. No reload, no delay before the seeker's own message appears.

7. Thread layout
Messages, interview answers, and resume bullets in the Harper thread wrap within the panel. Text never runs past the edge; long words and URLs break.

VERIFY
Use a real-scale fixture: a sales leadership profile with at least nine roles, recent roles with month-year dates and earlier roles with year-only dates, against a Senior Director of Sales posting requiring 10+ years of progressive leadership, MEDDIC, forecast discipline, and building front-line managers. With the web app and worker running locally, watch in the browser: Harper's briefing and summary render; the years requirement shows a calculated range from the dates; Harper's first gap question targets a real remaining gap; send a reply and see your message appear immediately with the thinking indicator; click Use this and see it confirm without hanging while the next question arrives separately.

REPORT
The cause of each defect and the fix, the watched verification steps, real model output (the summary, the years calculation, the first gap question), migrations, prompt versions, files changed, and a full-suite result.
