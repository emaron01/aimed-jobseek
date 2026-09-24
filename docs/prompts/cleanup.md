Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Cleanup. Work on main. Commit and push when all checks pass.

1. Thank-you facts
The seeker's answers to Harper's thank-you clarifying questions are seeker-authored FACT for that stage and must be available to the thank-you generation and claim validation, so the thank-you can reference what was actually discussed. Test that an answered clarifying question's content appears in the thank-you and passes validation.

2. Remaining copy
Rewrite the remaining "billing" and "admin" sentences in the "Remaining sales-framed copy" section of docs/refactor-map.md for AimedJobSeek, using the vocabulary module, and mark them done. Then search the UI for any remaining user-visible sales language (prospect, buyer, deal, pipeline, quota, campaign, selling, product as the thing being sold) outside the platform admin console, and fix or report each one.

3. Lint
Fix every lint error and warning, including the react-hooks/set-state-in-effect errors, by correcting the underlying code, not by disabling rules. If a rule genuinely conflicts with a correct pattern, disable it only on that line with a comment explaining why, and list each one in the report. npm run lint must pass with zero errors.

4. Stale documentation
Update docs/product-vision.md and docs/refactor-map.md to reflect what has been built: no Microsoft 365 integration (desktop and web handoff only), no lists or list scoring in the product, per-application Hiring Team identification, consultation, application assets, outreach, interview stages, and the Application Summary. Mark completed items complete and remove superseded plans.

REPORT
Files changed, copy changes by area, any remaining sales language found, lint fixes (including any rule disabled and why), and three full-suite runs.
