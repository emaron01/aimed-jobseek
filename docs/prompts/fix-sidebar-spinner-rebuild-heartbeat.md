Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below.

TASK: Fix the findings from the sidebar spinner investigation. Work on main. Commit and push when all checks pass.

1. Yellow is not a spinner
ApplicationStepMarker renders the animated spinner for every in_progress step, so "started, not finished" looks like a running job. Split the two: a step with an active job (PENDING or IN_PROGRESS for that step) shows the spinner; a step that is started but not finished shows a static yellow marker. A completed step with unread new results shows its NEW pill with a static marker, never the spinner.

2. Stop the rebuild on every worker start
queueExistingInterviewerProfileRebuilds runs on every worker start with no gate, so each deploy re-runs CONTACT_PROFILE and the cheat sheet regeneration for every interviewer with pasted profile text. Remove this startup rebuild. Interviewer profiles are built only when the seeker saves or changes pasted profile text.

3. Job recovery covers missing heartbeats
abandonStaleApplicationJobs misses IN_PROGRESS jobs whose workerHeartbeatAt is null. Align it with claimNextApplicationJob so those jobs are also re-queued.

TESTS
- A step with an active job shows the spinner; a started, unfinished step with no active job shows the static yellow marker; a completed step with unread results shows a static marker with its NEW pill.
- Worker startup does not queue interviewer profile rebuilds; saving or changing pasted profile text still builds the profile and regenerates that person's cheat sheet section.
- An IN_PROGRESS job with a null heartbeat is re-queued by recovery.

REPORT
What changed, files changed, and a full-suite result.
