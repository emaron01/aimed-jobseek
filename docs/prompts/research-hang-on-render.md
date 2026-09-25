Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.
PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.
TASK: Company research hangs on Render. The aimed-jobseek Render deployment has only a web service, no background worker. Diagnose, fix the hang, and tell me exactly what to set up in Render. Work on main. Commit and push when all checks pass.
1. Diagnose (report first)
- Explain how company research executes in production: what enqueues ResearchRun rows, what processes them (scripts/research-worker.ts or anything else), and whether anything in the web service processes them.
- Check render.yaml, package.json scripts, and docs for how the worker is meant to be deployed, and state the exact Render service type, build command, start command, and required environment variables.
- Identify which save action the seeker triggered on the application (creating the application, confirming or correcting the employer, or retrying research) and what it waits on.
2. Never hang
- No save action waits for research to finish. Saving returns immediately; research status shows on the application (Queued, Researching, Done, Failed) and updates without a manual reload.
- If a run stays queued beyond a configured time with no worker picking it up, show a clear status saying research has not started, with a retry action. Log it as an operational error.
- Test: save returns without waiting for research; a stale queued run shows the not-started status.
3. Render setup instructions
Give me step-by-step instructions to create the worker in the Render dashboard: service type, repository and branch, build command, start command, the environment variables it needs (names only, no values), and how to confirm it is processing jobs.
REPORT
The diagnosis, the fix and its tests, the Render instructions, files changed, and a full-suite result.
