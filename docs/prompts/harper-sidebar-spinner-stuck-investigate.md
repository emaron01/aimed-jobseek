Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

REPORT ONLY. Do not change any code, configuration, schema, prompts, or data.

PROBLEM
In production, the Harper step on the CSC application ("CSC Sr. Director...", application cmuh9a2w5005lko2nzbo1g6qt) has shown a running spinner in the sidebar for hours, through several deploys. The spinner persists after a full page reload. Other yellow steps also spin.

Production worker log after the most recent restart:
[research-worker] schema ready
[research-worker] queued missing named-employer research: 0
[research-worker] queued interviewer profile rebuilds: 1
[research-worker] application job cmujy968a0001tg2qp9ip4vy9 type=CONTACT_PROFILE application=cmuh9a2w5005lko2nzbo1g6qt durationMs=15168 outcome=succeeded
[research-worker] application job cmujy9j1y0007tg2q475a3oar type=APPLICATION_SUMMARY application=cmuh9a2w5005lko2nzbo1g6qt durationMs=42122 outcome=succeeded

After the seeker approved a Harper result:
[research-worker] application job cmujz3mqo0001p02n50rt1iq3 type=CONSULTATION application=cmuh9a2w5005lko2nzbo1g6qt durationMs=1396 outcome=succeeded
The Harper step still spins after that job succeeded, including after a full page reload.

INVESTIGATE AND REPORT
1. What makes the Harper step show a spinner: the exact condition in code (which job types and statuses, and any other signals).
2. The actual job(s) in the production database for this application that meet that condition: id, type, status, created and started times, attempts, last error, and any worker or lock fields.
3. Whether the production worker has attempted those job(s); check the worker logs around each deploy.
4. What happens to a job that is running when the worker restarts on deploy: is it finished, re-queued, or left marked as running? Show the code path.
5. Whether any existing code recovers jobs left marked as running, and why it did not recover these.
6. Any other application or job currently stuck the same way.
7. The worker logged "queued interviewer profile rebuilds: 1" at startup, followed by CONTACT_PROFILE and APPLICATION_SUMMARY jobs for the same application. Report whether this rebuild queues again on every worker start (and so regenerates the profile and cheat sheet on every deploy), why, and how many times it has run in production, with the model cost of those runs.
8. After the seeker approved a result, job cmujz3mqo0001p02n50rt1iq3 (CONSULTATION) succeeded in 1,396 ms, yet the Harper step still spins. Report exactly which job row or condition keeps the spinner on.
9. After a full page reload, every yellow step spins (Harper, Resume and cover letter, Personas and Interviewers, Interview cheat sheet), not only steps with a running job. For each spinning step, report the exact condition that produced its state and icon, and whether Pass 1 renders "started, not finished" with the same animated spinner used for a running job.

Conclude with the confirmed cause of each problem, backed by the data above, and what a fix would need to change. Do not implement it.
