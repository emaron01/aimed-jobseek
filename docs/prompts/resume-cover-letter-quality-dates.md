# Fix two quality defects in resume and cover letter output

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Fix two quality defects in resume and cover letter output. Work on main. Commit and push when all checks pass.

1. Date display
Resume dates currently render raw ("2021-01 —", with a missing end date for the current role). Render dates as "Month YYYY – Month YYYY", and a current role as "Month YYYY – Present". Use a proper en dash between dates. The display format and the word for a current role come from configuration. Stored dates are unchanged; this is rendering only, in both the workspace view and the DOCX. When only a year is known, show the year alone; never invent a month.

2. Cover letter writing quality
- Apply the same repetition and meta-language checks used for consultation statements to every asset. Output repeating a fact or phrase without adding information is regenerated.
- Add to the configured banned phrases: "I'm excited to apply", "I am excited to apply", "I am writing to", "I'm writing to", "draws me to", "I would welcome the opportunity", "I believe I would be a great fit", "Thank you for your consideration", and "perfect fit".
- The opening sentence must make a specific point that connects something concrete about this company (from cited research) to the seeker's own relevant experience. Generic enthusiasm is not an opening.
- Bump the cover letter prompt version.

TESTS
- Date rendering for a completed role, a current role, and a year-only date, in the view and in the DOCX.
- A cover letter repeating a phrase is regenerated.
- Each new banned phrase triggers regeneration.
- The opening references cited research and a Personal Profile fact.

REPORT
Real model output (actual calls): the resume experience section with the new dates, and the full regenerated cover letter for the normal fixture posting. Also the prompt version and files changed.
