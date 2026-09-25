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
TASK: Fix Hiring Team persona defects, turn the Application Summary into an Interview Cheat Sheet organized by the people the seeker will meet, add per-person prep with Harper, enforce one button standard with visible progress everywhere, and complete the resume contact header. Work on main. Commit and push when all checks pass. If any part is already done from the previous task, verify it across every screen and fix any gap.
PART 1: Hiring Team persona defects (fix first; the cheat sheet depends on them)
1. Perspective: every persona's talking points are what THE SEEKER says to that person, and likely concerns are what THAT PERSON worries about regarding the seeker. In production, the Talent Acquisition Partner persona's talking points were written as if the seeker were applying to be a recruiter ("Describe how you would build a target map for senior sales leaders..."). Add a validation check that rejects talking points written from the persona's own job perspective, and regenerate.
2. Duplicates: production showed "Customer Success Leader" twice, and "Executive Sponsor" overlapping "Executive Sales Sponsor" (whose titles also mixed in Revenue Operations roles). Merge roles that describe the same person by meaning, keep each role's titles coherent to that role, and never show two roles for the same function.
3. Story linking: the seeker's go-to-market story was linked to "Why the seeker wants to work at this company". Stories link only to requirements they actually demonstrate. "Why this company" is answered only by the seeker's own stated motivation.
PART 2: Interview Cheat Sheet
1. Rename "Application Summary" to "Interview Cheat Sheet" everywhere, via the vocabulary module.
2. Organize it by person: one section per Direct Hiring Team role, and per contact when a real person is linked to a role (using their individual profile when one exists). Each section is tailored to what that person evaluates:
   - Recruiter or talent acquisition: top-line fit and whether the seeker is a safe candidate to put forward. A 60-second career summary, why this company and this role, logistics (location, hybrid schedule, timing), compensation readiness, and prepared, honest answers to anything likely to raise a flag (for example, title changes or gaps in a career history).
   - Hiring manager: the job itself. The role's scorecard outcomes, the seeker's strongest stories mapped to each, how they would approach the first 90 days, the likely drill-down questions, and the gaps with how to address them.
   - Executives: strategy, judgment, and business impact, plus questions to ask.
   - Indirect and cross-functional roles: how the seeker has worked across functions like theirs, with specific stories, and how they would work with this person day to day.
   Each section: what this person cares about, the seeker's best material for them, likely questions, and questions to ask them. Concise: no more than a few items per heading.
3. Stories without repetition: each story appears once, with "This story answers:" listing the requirements and likely questions it covers, followed by a short variation for each angle (for example, the forecast-discipline angle and the manager-coaching angle of the same story), written by the model. Never repeat the same story text verbatim under multiple headings.
4. A short top section for the whole sheet: the 30-second version of the seeker's fit, the career recap, and the two or three gaps to be ready for.
5. Keep print and save as PDF, per section and for the whole sheet.
PART 3: Harper prepares for each person
When the seeker adds an interview stage with a specific person (or links a person to a Hiring Team role), Harper offers a short, focused prep conversation for that person: what they will likely probe, which of the seeker's stories fit, and one or two questions to strengthen weak spots for this interviewer. Confirmed answers flow into the person's section of the cheat sheet and into the interview guide.
PART 4: One button standard for the whole application
- One shared button component (and shared pending indicator) used by every button and action link in the seeker-facing app. Replace every other button implementation.
- Every button shows it is clickable: a pointer cursor, a visible hover state, a visible keyboard focus state, and a pressed state. Disabled buttons look disabled and explain why when the reason is not obvious.
- Every button that saves or starts AI work shows a spinning indicator from the moment it is clicked until it succeeds or fails, and is disabled while pending so it cannot be double-clicked. Longer AI work then hands off to the workspace's progress status.
- Any in-progress AI work anywhere (Harper, persona builds, resume, cover letter, outreach, interview guides, cheat sheet, research) always shows a spinner until it renders or fails.
- Add a test that fails if any seeker-facing component renders a raw button or submit element outside the shared component.
PART 5: Resume header contact details
- The resume header shows, under the name: city and state, phone, email, and LinkedIn URL (never a street address), extracted from the seeker's materials into the Personal Profile contact fields as FACT. In production, the seeker's resume contained all four, yet the header showed only the name; find why and fix it. Existing profiles are re-extracted from their stored sources without overwriting seeker-edited fields.
- When a contact detail is missing, the resume workspace says which one and links to the Personal Profile to add it. Never invent one.
- The DOCX header renders them on one or two lines under the name, in the configured style.
TESTS
- Talking points are always from the seeker's perspective; the recruiter-perspective defect is rejected and regenerated.
- Duplicate roles merge by meaning; titles stay coherent.
- A story links only to requirements it demonstrates; "why this company" never shows a story.
- The cheat sheet has one section per Direct role or linked contact, tailored by type.
- Each story appears once with its covered questions and variations; no verbatim repetition.
- Per-person Harper prep is offered when a stage or linked person is added, and confirmed answers reach that person's section.
- Every seeker-facing button uses the shared component, with hover, focus, and a pending spinner; any in-progress AI work shows a spinner.
- The resume header shows city and state, phone, email, and LinkedIn when present, and names any missing detail.
REPORT
Real model output for a CSC-style fixture (a Senior Director of Sales posting and a sales leadership profile): the regenerated Talent Acquisition persona talking points, the merged Hiring Team list, the cheat sheet's recruiter section and hiring manager section, one story with its variations, Harper's opening for a per-person prep session, and a resume header. Also migrations, prompt versions, files changed, and a full-suite result.
