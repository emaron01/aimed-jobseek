# Fix Hiring Team persona draft quality

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Fix Hiring Team persona draft quality. Work on main. Commit and push when all checks pass.

PROBLEM
The drafted Hiring Manager persona for the fixture posting is empty and circular: "Feels the hire through that reporting line", "Presses on the reporting line", "Connect a story to the reporting line", and "Needs" is a copy of the requirements list. Personas must be as substantive as the product personas this codebase produced for Aimed Outreach (pressures, concerns, and talking points specific to the person's real job).

REQUIRED
1. Find the source. Report whether the sample text was written by the model or composed by product code. If ANY product code composes persona narrative text (overview, impact, needs, concerns, talking points, communication), remove it. When synthesis cannot run (model not configured, error, timeout), the role shows its identification only, with a clear status and a retry action. Never generate substitute narrative in code.

2. Synthesis quality (src/lib/prompt-content/persona-synthesis.ts; bump the version)
Each persona is written from what this person actually does at this company, using the JobRequirement AND CompanyResearch:
- Overview: their real responsibilities and what they own (for example, for a Director of Engineering at a robotics company: delivery, fleet reliability, team capacity, on-call load, the hiring bar).
- Pressures: what they are measured on and what keeps them up at night, as it relates to this hire.
- Impact: concretely how this hire changes their work (for example, which load it takes off them, which outcome it lets them deliver).
- Needs: what they need the new person to do in the first months, stated as outcomes, not a copy of the requirements.
- Concerns: the specific doubts this person would have about a candidate for this role (for example, ramp time, domain depth, production ownership), which the seeker's consultation and interview prep will address.
- Talking points: specific things the seeker can say to this person that connect to their pressures, including how the seeker would work with their function day to day.
- How to communicate: what this person values in a conversation.
Every sentence must say something specific to this role at this company. Circular sentences that restate the reporting line or the requirement text are not acceptable; add a validation check that rejects output where the fields merely restate the job requirement text, and retry synthesis.

3. Evidence
Use CompanyResearch when available. For undisclosed employers, write from the job requirement and industry context, marked INFERENCE, and update when research completes.

REPORT
The source of the old text, what was removed, and a real model-generated draft (from an actual model call, not a fixture or test double) of the Hiring Manager, the Reliability Lead, and the Recruiter for the normal fixture posting. Also the prompt version, files changed, and anything that could not meet this standard.
