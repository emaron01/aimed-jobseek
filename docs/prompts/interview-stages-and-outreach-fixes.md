Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

Read docs/product-vision.md before starting. Follow the prompt content layer pattern in src/lib/prompt-content/. No product code may write narrative text; the model writes, product code validates and organizes.

TASK: (A) three outreach fixes, then (B) the interview stages slice. Work on main. Commit and push when all checks pass.

PART A: Outreach fixes
1. Apply the banned phrase and character checks (including em dashes) to subject lines, not only bodies.
2. Reject and regenerate output with more than one ask or more than one redirect line, and output whose final sentence lacks ending punctuation.
3. Reject and regenerate statements presented as fact about the recipient's team or work that are not supported by the persona or research as FACT (for example, "the motion-planning work would be felt by the robotics team every week"). Inferences about the recipient must be phrased as the seeker's understanding, not as fact.
Bump the affected prompt versions.

PART B: Interview stages

WHY
Interviews are where the job is won. Each stage has different people evaluating different things, and what the seeker learns in one stage should shape preparation for the next. This follows the Who method sequence: recruiter screen, hiring manager chronological walk-through, focused competency interviews, and executive conversations.

1. Stages
- An application has ordered interview stages. Each stage: type (recruiter screen, hiring manager, panel or competency, executive, other; labels from configuration), date and time, format (phone, video, onsite), interviewers, notes before (what the seeker was told to expect), notes after (what was discussed and what they learned), expected decision date (optional), and outcome.
- Interviewers are added through the single-contact add. Interviewer contacts are role-confirmed and matched to a Hiring Team role; the seeker can change the match.
- Application status: Applied, Interviewing, Offer, Rejected, Withdrawn. Adding the first stage sets Interviewing; the seeker sets the rest.

2. Stage guide (model-written, per stage)
- Before generating, Harper may ask the seeker up to three short clarifying questions when information that would materially change the guide is missing (for example, who they are meeting or what the recruiter said to prepare for). The seeker can answer or skip.
- The guide covers: the purpose of this stage and what it decides; for each interviewer, who they are (from their persona), what they will evaluate, likely questions (drawn from the persona's concerns, the scorecard competencies, and the consultation gaps), and the seeker's best answer material for each, linked to approved statements and stories by id; talking points; and thoughtful questions to ask each interviewer.
- For a hiring manager stage, include chronological walk-through preparation: for each role on the Personal Profile, the key accomplishments and the reason for moving on. Never invent a reason for leaving; when it is unknown, Harper asks.
- Generic when little is known; curated from everything recorded so far. Notes from earlier stages carry forward (for example, "the recruiter said the next interviewer focuses on X" changes the next guide).
- When post-stage notes reveal a new gap, Harper offers a short consultation round targeting it.
- Claim rule, banned phrases, repetition, and meta-language checks apply. Use the ASSET_AI role for writing. The guide is printable using the Application Summary print stylesheet.
- Regenerate is offered when inputs change; it never regenerates automatically.

3. Thank-you and follow-up messages
- After a stage, per interviewer: a thank-you email and a LinkedIn message, generated with the outreach machinery. They reference specific points from the seeker's post-stage notes (seeker-authored FACT), not generic gratitude. Interviewers are confirmed recipients: no redirect line.
- A check-in message after the expected decision date passes without an outcome.
- Handoff, Mark as sent, and fail-closed claims work as for outreach.

4. Interview reminders (alerts only)
- Thank-you due within the configured window after the stage (default 24 hours), prompting the seeker to record notes first.
- Check-in due the day after the expected decision date, or after a configured number of business days (default 5) when none is set.
- Recording any outcome clears that stage's reminders.
- Delivered through the application reminder source to Home and the digest. Windows come from configuration.

5. Application Summary
Add an Interview stages section: completed stages with key learnings, and the next stage with a link to its guide. It goes stale when stages change, as with other sources.

TESTS
- Part A: an em dash in a subject regenerates; a double ask regenerates; missing final punctuation regenerates; an unsupported claim about the recipient's team regenerates.
- Stage creation sets Interviewing; interviewer contacts are role-confirmed.
- Clarifying questions are limited to three and can be skipped.
- A hiring manager guide includes chronological preparation, and an unknown reason for leaving produces a question, not an invented reason.
- Notes from an earlier stage change the next stage's guide.
- Thank-you messages reference the seeker's notes and never include a redirect line.
- Reminder timing for thank-you and check-in, and an outcome clears them.
- The guide prints without navigation or controls.

REPORT
All sample output must come from real model calls using the ASSET_AI configuration in .env.local. For the normal fixture posting: a recruiter screen guide, then post-stage notes saying the hiring manager will focus on incident leadership, the resulting hiring manager guide (showing how the notes changed it), and a thank-you email to the recruiter. Also migrations, prompt versions, files changed, and anything that could not meet this standard.
