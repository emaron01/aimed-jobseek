Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Close the remaining leftovers from the cleanup report. First confirm the cleanup commit is on origin/main and report its hash. Work on main. Commit and push when all checks pass.

1. Server-side gating
When a feature flag is off, every page and server action for that feature returns not found (or a forbidden error for actions), not only its navigation links. Cover: /lists and all list routes, /scoring, bulk validation, list import, the legacy campaign email sequence workspace, Microsoft 365 connected sending, and the product-level Hiring Team route /setup/[productId]/personas/new (roles are identified per application). Platform admin routes are unaffected. Test that each returns not found with its flag off.

2. Contacts page
Remove the list filters from /contacts. Filtering by application remains.

3. Prompt audit
Determine whether src/lib/.../persona-prompt.ts (or any other prompt containing sales framing such as "Desired Outcomes From Your Solution") is used by any job-seeker path. If it is, move its content into src/lib/prompt-content/ with job-seeker framing and bump its version. If it is used only by gated sales paths, leave it and state that in the report.

REPORT
The cleanup commit hash, each gated route and its test, the prompt audit result, files changed, and one full-suite result.
