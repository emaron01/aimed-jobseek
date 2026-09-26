Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Restructure interview stages around the interviewer and the persona cheat sheets, add interviewers' LinkedIn profiles to their cheat sheet sections, and generate cheat sheet sections only when needed. Work on main. Commit and push when all checks pass. Change nothing else.

PART 1: Interview stages
1. The interviewer comes first, at the top of the stage: a dropdown of people already on the application (for example, the recruiter), plus "Add new interviewer", which adds the person (first name, last name, and title required; email, LinkedIn URL, and pasted LinkedIn profile text optional) and aligns them to a persona. Each stage can have a different interviewer.
2. The stage shows the interviewer's cheat sheet section, pulled from the Interview Cheat Sheet. The stage does not generate its own guide.
3. The stage has a place to add newly gained information for this interview (for example, the text of an invitation email saying what they are interested in, or the seeker's notes). That information is added to the interviewer's cheat sheet section, so everything stays stored on the cheat sheets.
4. The stage keeps showing that section afterward, as an archive and easy reference for that interview.

PART 2: LinkedIn profiles in the cheat sheet
Every person's cheat sheet section is built from their persona. When the person has a pasted LinkedIn profile with enough substance, it adds to the persona: their background, what they focus on, and how the seeker's experience connects to it, so the seeker can lean into what this person is likely to value. LinkedIn is additive, never authoritative: it never replaces or overrides the persona. When the profile is missing or too thin to be useful, the section uses the persona alone.

PART 3: Cheat sheet sections generated only when needed
1. Cheat sheet sections are generated on demand, like personas: when the seeker clicks Generate on a section, or when a person in that persona is added to an interview stage. No section is generated for a persona the seeker is not preparing for.
2. Sections not yet generated show the persona's name with a Generate button.
3. Existing generated sections stay as they are.

TESTS
- A stage's interviewer can be chosen from existing people or added new (with optional LinkedIn text) and aligned to a persona.
- The stage shows the interviewer's cheat sheet section without generating a separate guide.
- Information added on a stage appears in that person's cheat sheet section.
- A person with a substantial pasted LinkedIn profile gets a section built from their persona plus their LinkedIn background; a thin or missing profile uses the persona alone.
- Sections are generated only on Generate or when an interviewer in that persona is added to a stage.

REPORT
What changed, a screenshot of a stage with an interviewer and their cheat sheet section, the AI calls saved compared with generating every persona section, files changed, and a full-suite result.
