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

TASK: Harper does not work in production, and the application workspace UX is poor. Fix Harper end to end, then apply the UX batch. Work on main. Commit and push when all checks pass. Part 1 comes first and must be verified before Part 2.

PART 1: Harper must work (critical)
In production on Render (web service plus background worker, both on the latest commit, both with all AI variables), clicking Start with Harper shows "Start with Harper was queued." and Harper never appears. The worker picks up the jobs and logs them as finished (production worker logs below), yet no briefing, question, or result appears in the workspace.
1. Diagnose the full path: the click, the job row written, the worker claiming it (confirm the worker processes every ApplicationJob type, not only research runs), the model call, the result written, and the page showing it. Identify exactly where it breaks: a job that fails silently while being logged as finished, a result written somewhere the page does not read, or a page that never refreshes to show it.
2. Fix the cause. Then verify end to end LOCALLY with the web app AND the worker process both running, as in production: start Harper, see the briefing and first question appear without a manual reload, reply, and see Harper's coaching reply appear. Do the same for building a Hiring Team persona and generating a resume. Do not report Part 1 as done until you have watched each of these complete in the browser.
3. Harper's jobs take priority over other background work, so a Harper reply is never stuck behind a resume or research job. Confirm the worker's concurrency setting applies to all job types, and report the value it needs in Render.
4. Any job that fails shows a plain-language error and a retry action in the workspace, and logs its cause.
5. Worker logging: every job log line includes the job type, application id, duration, and outcome (succeeded or failed). A failure logs its error and cause. A job that throws or returns a failure must never log "finished" as if it succeeded, and must be marked Failed in the database so the workspace shows it with retry.

PART 2: UX batch
1. Human status, never "queued": replace every "... was queued" message with plain progress text describing what is happening (for example, "Building the Hiring Manager persona…", "Harper is reading your profile and the job…"), with a progress indicator. Results appear automatically when ready; no reload is ever needed.
2. Harper feels live: a "Harper is typing…" indicator in the thread while a reply is being generated.
3. Workspace order: Next step (Harper's card), Company, Job requirement, Employer fit, Hiring Team, Harper, Resume and cover letter, Contacts, Outreach, Applied, Interviews, Application Summary. Company research, its identity check, and its status become their own Company section, separate from the job requirement.
4. Employer fit override: selecting a rating saves it. Remove the reason field and any gate on saving.
5. Why this company: Harper asks once per application, in the conversation, why the seeker wants to work at this company. The confirmed answer is a seeker FACT used by the cover letter, the interview guides (for "Why do you want to work here?"), and the Application Summary.
6. Edit on every persona: each Hiring Team persona has an Edit action. Seeker edits are protected through rebuilds, as Personal Profile edits are.
7. Add the real people: a prominent note at the top of the Hiring Team section: "When you know who will be interviewing you for this role, add them to their Hiring Team role." Each persona has an Add person action (name, title, email, LinkedIn profile paste) that creates the contact linked to that role and starts their individual profile.

TESTS
Part 1: the worker processes every ApplicationJob type; a failing job is marked Failed and logged with its cause, never as finished; Harper start produces a briefing and first question; a reply produces coaching; results render without reload; failures show an error with retry; every job log line has type, application id, duration, and outcome.
Part 2: no "queued" wording anywhere in seeker-facing text; workspace order; override saves without a reason; the why-this-company question is asked once and its answer is used downstream; persona edits survive rebuild; Add person creates a linked contact.

REPORT
The exact point where Harper broke and the fix, confirmation of each local end-to-end check you watched complete, the worker concurrency value for Render, the UX changes, migrations, prompt versions, files changed, and a full-suite result.

PRODUCTION WORKER LOGS (from clicking Start with Harper):
[research-worker] starting (migrations owned by web pre-deploy)
[research-worker] research AI configured: true
[research-worker] schema ready
[research-worker] processing application job cmuhalg2r000hoy2u7d9bj20a
[research-worker] finished application job cmuhalg2r000hoy2u7d9bj20a
[research-worker] claimed run cmuhanil7000toy2uk42vcfqg (application cmuh9a2w5005lko2nzbo1g6qt, status was PENDING)
[research-worker] processing run cmuhanil7000toy2uk42vcfqg
[research-run cmuhanil7000toy2uk42vcfqg] processing application cmuh9a2w5005lko2nzbo1g6qt (org cmudkag9z000mq0d05l9urk67, company cmuh90x2j000br62po6b4hyb9, forceRefresh=false)
[research-run cmuhanil7000toy2uk42vcfqg] application research COMPLETED
[research-worker] finished run cmuhanil7000toy2uk42vcfqg
[research-worker] processing application job cmuhanksd0005s52q0uyjygub
[research-worker] finished application job cmuhanksd0005s52q0uyjygub
[research-worker] processing application job cmuhauomr001poy2uoc0jwhgh
[research-worker] finished application job cmuhauomr001poy2uoc0jwhgh
[research-worker] processing application job cmuhavaqk0021oy2uwh86vp50
[research-worker] finished application job cmuhavaqk0021oy2uwh86vp50
[research-worker] processing application job cmuhavar30023oy2ugq4lhuyf
[research-worker] finished application job cmuhavar30023oy2ugq4lhuyf
[research-worker] processing application job cmuhavat60025oy2ugymzww7e

8. Waiting states: two kinds of wait, handled differently.
- Stay-and-watch work (Harper's replies and questions, building a single persona, polished statements, regenerating one message): show a spinning indicator with plain progress text where the result will appear, and keep the seeker on the page until it renders. The result replaces the spinner automatically.
- Longer background work (company research, Hiring Team identification, resume, cover letter, interview guide, Application Summary): show a spinning indicator with a plain estimate and tell the seeker they can keep working ("This usually takes a minute or two. You can keep working; it will appear here when it's ready."). When it completes, the section updates automatically, and a brief notice appears wherever the seeker is in the workspace saying it's ready, with a link to it.
- Which work falls in which group is set in configuration, not scattered in components.
- No wait state is ever silent: every in-progress item shows a spinner until it succeeds or fails.
- Every in-progress item shows a spinner; stay-and-watch results replace the spinner in place; longer work shows the keep-working message and a completion notice with a link.
