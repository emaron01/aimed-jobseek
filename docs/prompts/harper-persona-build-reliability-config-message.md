# FOLLOW-UPS — Persona config seeker message + non-blocking startup log

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. No temporary fixes, no data repair, no migrations, no schema changes.

SURGICAL RULE
Change only the two items below. Do not change anything else. Add no features.

CONTEXT
The persona build reliability follow-ups (docs/prompts/harper-persona-build-reliability-followups-report.md) stopped on ITEM 2 for product owner wording. The product owner has supplied it and one correction.

ITEM 1: Seeker message.
Replace the seeker-facing message returned by queueHiringTeamBuild when persona synthesis is not configured ("Persona synthesis is not available yet. Try again after setup is complete.") with exactly:
Personas can't be built right now. Please try again shortly.
It renders where it renders today (action fail() → ApplicationActionForm). Change no other message.

ITEM 2: Startup detection logs; it never stops the app.
The decision was that a missing persona synthesis configuration is logged as an operational error at startup. assertPersonaAiConfigured() currently asserts in production (web instrumentation.ts register() and the worker).
- Report exactly what the assert does today in production (throw, exit, or log) for the web service and the worker.
- Change it so that at web and worker startup a missing configuration is logged as an operational error (console.error, or the existing operational logger if there is one), and the web service and worker always continue starting. It must never throw, exit, or stop either service.
- The seeker message in ITEM 1 remains the only seeker-facing effect.

TESTS
Add or update automated tests that assert:
- With persona synthesis not configured, queueHiringTeamBuild returns exactly "Personas can't be built right now. Please try again shortly." and no system language.
- With persona synthesis not configured, web and worker startup log an operational error and do not throw or exit.
- With it configured, startup logs nothing for it.
Run the full existing test suite, including real-Postgres tests, and confirm it passes with no new failures.

REPORT
1. What the assert did before, for web and worker.
2. What changed for ITEM 1 and ITEM 2, with file and line.
3. Every file changed.
4. Tests added or changed and the full test suite result, confirming the real-Postgres tests ran.
5. Confirmation that nothing else changed.
