Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.
PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
SURGICAL RULE
Change only what is listed below.
TASK: Fix the defects found in the live verification. Work on main. Commit and push when all checks pass.
1. Commit the worker startup fix
The uncommitted change that runs queueMissingNamedEmployerResearch for each organization under runWithTenantContext fixes the worker failing to start. Commit it with a test proving the worker starts with existing applications that need research.
2. A confirmed gap is Confirmed, with no resume bullet
Live case: "I have never sold digital brand protection, domain services, or digital-risk products. My closest work is patient-identity software at Contoso Health." was marked Closed, with a resume bullet ("Bring adjacent patient-identity software experience... rather than direct sales experience...") and a follow-up.
- Find why this was not decided no_evidence, and fix it in the extract instructions and any code that decides the status.
- A no_evidence decision marks the gap Confirmed in Where you stand, produces no resume bullet, and asks no follow-up.
- Its talk track acknowledges the gap, bridges to the named related experience, and says how the seeker would close it in this role.
3. An incomplete answer produces no results
Live case: "I have used forecasting." produced an interview answer ("I have experience using forecasting.") and a resume bullet ("Used forecasting."). An incomplete decision produces only coaching and one follow-up question. No interview answer or resume bullet is written, and the gap stays open.
4. Coaching speaks to the seeker as "you"
Pass 2 changed the extract instructions so coaching and follow-up questions are written in first person, which produced "which MEDDIC elements did I inspect". Correct the extract instructions: coaching and followUpQuestion address the seeker as "you". Facts, story fields, and explanations stay first person or neutral. Bump the consultation prompt version.
VERIFY
Rerun the four live scenarios with the web app, the worker, and the real model on the CSC-shaped application, and report every output verbatim: (a) Partial gap with added detail, (b) evidence closes a gap, (c) confirmed gap, (d) incomplete answer.
TESTS
- The worker starts with existing applications that need research.
- A no_evidence answer is marked Confirmed, has no resume bullet, asks no follow-up, and has a bridging talk track.
- An incomplete answer produces coaching and one follow-up only; no interview answer or resume bullet.
- Coaching and follow-ups address the seeker as "you".
REPORT
The cause of each defect, the fix, the four live outputs verbatim, files changed, and a full-suite result.
