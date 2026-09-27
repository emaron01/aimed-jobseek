# Prompt: No AI on page view, skip unchanged regen, record research cost

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below. Production code only: no repair or migration of existing data.

TASK: No AI runs when the seeker opens or views a page, nothing regenerates when its inputs have not changed, and research cost is recorded (findings from the AI cost audit). Work on main. Commit and push when all checks pass.

1. Nothing fires on page view
Remove every AI enqueue from page rendering (ApplicationWorkspace and getApplicationOverview):
- ensureApplicationNextStep: the next-step card is generated only when a seeker action or a finished job changes the application's state. Page views show the last saved text.
- ensureHiringTeamAfterResearch: persona identification runs once when research completes, as part of the research job, not on page view.
- ensureNamedEmployerResearch: research is queued only when an application is created or its employer is updated, and only when no research within the reuse window exists. Page views never queue research.

2. Nothing regenerates when inputs are unchanged
- Saving stage notes re-runs the job requirements parse only when the notes' text actually changed, and never re-parses the posting text itself when it has not changed.
- Pasting an interviewer profile queues that person's cheat sheet section once, after their profile finishes, not twice.
- A cheat sheet section regenerates only when its inputs changed (the person's profile, persona, notes, or the application data it uses). An unchanged section is not regenerated.
- Saving the same pasted profile text again does not rebuild that person's profile.

3. Record research cost
Company research calls do not pass aiCallTracking, so their cost never reaches the costs page. Record every research stage and web search call as a usage event, like every other AI call, with its operation, model, token counts, cached tokens, cost, and the application id.

TESTS
- Rendering any application page enqueues no AI job.
- The next-step card updates after a state-changing action or job, and not on page view.
- Persona identification runs once when research completes.
- Research is queued on create or employer update only, and skipped when fresh research exists.
- Unchanged stage notes, re-saved identical profile text, and unchanged cheat sheet inputs trigger no AI.
- Pasting a profile queues that person's cheat sheet section exactly once.
- Every research stage and web search call records a usage event with its cost and application id.

REPORT
Each change, files changed, and a full-suite result.
