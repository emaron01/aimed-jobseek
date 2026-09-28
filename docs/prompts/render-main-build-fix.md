Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix type and build errors at the root; do not silence them (no @ts-ignore, no @ts-expect-error, no any casts, no disabling lint or type rules, no build-config changes to skip checks).

SURGICAL RULE
Fix only what the production build reports. Do not change behavior, UI, prompts, schema, or data. Add no features.

CONTEXT
The Render deploy of main failed at the Next build (a ConsultationSection const-assertion error). The test suite passed because it does not type-check the full app the way the production build does.

TASK
1. Run the exact production build locally, the same command Render runs (check package.json and the Render build command; include prisma generate if the build does). Also run the full type check (tsc --noEmit or the project's typecheck script) and lint if the build runs it.
2. Fix every error reported, at the root. Re-run until the build, the type check, and lint all pass with zero errors.
3. Run the full test suite, including real-Postgres tests.
4. Commit the fixes to main with a message naming the build fix, and push main to trigger the deploy. Do not force-push.

TESTS
The production build, the full type check, lint (if the build runs it), and the full test suite including real-Postgres tests all pass with zero errors. Report each result.

REPORT
1. The exact build, type-check, and lint commands run.
2. Every error found and how each was fixed, with file and line.
3. Confirmation that no error was silenced and no behavior changed.
4. The build, type-check, lint, and test suite results.
5. The commit hash pushed to main.
6. What the product owner should check in Render: the build succeeded, the pre-deploy migrations succeeded, and the web service and worker are both running.
