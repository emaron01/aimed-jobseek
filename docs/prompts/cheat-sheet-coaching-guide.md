Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.
PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
SURGICAL RULE
Change only what is listed below. Do not remove any other existing functionality, button, section, or page.
TASK: Make the Interview Cheat Sheet the coaching guide for the specific people the seeker interviews with, and fix its generation. Work on main. Commit and push when all checks pass.
PRINCIPLE
The seeker sees end results, never how the product produces them: no internal mappings, requirement lists, raw inputs, generation timestamps, or technical wording.
WHAT THE CHEAT SHEET IS
The cheat sheet is the seeker's interview coaching guide. Personas are used for outreach and as the foundation for each person's section; there are no generic per-persona sections.
1. A shared top section: company background, the job requirements, and where the seeker shines.
2. One section per person the seeker is interviewing with (a person added to an interview stage, or added through "I know who is interviewing me in this group"). Each is built from that person's general persona plus their own persona and evidence (their individual profile, likelyToValue synthesis, interviewer profile details, invitation details, stage notes, and What I've learned). Each section contains, all written by Harper in the seeker's voice (first person "I" for anything the seeker says):
   a. What this person cares about, and how the seeker's experience connects to them.
   b. Positioning statements: how the seeker should position themselves for this person, as statements the seeker can say.
   c. Key statements: the specific points the seeker should make with this person, ready to say aloud.
   d. Likely questions this person will ask, especially behavioral questions in the form "Tell me how you..." and "Tell me about a time...", each with a sample answer in the seeker's words.
   e. Questions to ask this person, including follow-up questions.
3. The general persona and the person's own persona are both used and never merged.
4. A person's section is generated when they are added, and regenerated when new information about them is saved.
5. If the person's persona is not built yet, show: "You have not fully built this persona. Do you want to build it now?" Yes builds it, then generates the person's section.
6. Do not show sections for personas with no person the seeker is interviewing with.
FIXES
1. Generation fails ("Cheat sheet synthesis failed. Retry." and "Guidance generation failed."). Remove the validation that checks every line against a quoted source; it is a content gate, and the product no longer gates generated content. Only unparseable model output may retry. Find any other cause (worker log below, if provided) and fix it.
2. Existing applications: generate the section for every person already added as an interviewer (such as Christina Schivley).
3. Remove from the cheat sheet: the Stories section, "This story answers:" lists, requirement mappings, raw seeker answers, the "Generated" timestamp, and technical wording such as "synthesis".
VERIFY
With the web app and worker running on the CSC-like application: the shared top section and Christina's section generate with every part listed in item 2; adding a new interviewer whose persona is not built shows the build prompt, and yes builds the persona and generates their section.
TESTS
- The cheat sheet has the shared top section plus one section per interviewer, and none for personas without an interviewer.
- Each person's section contains what they care about, positioning statements, key statements, likely "Tell me how you..." questions with sample answers, and questions to ask.
- A person's section uses their general persona plus their own persona and evidence, including likelyToValue when present.
- Adding a person or saving new information about them regenerates their section.
- An interviewer with an unbuilt persona gets the build prompt; yes builds it and generates the section.
- No content check can block cheat sheet generation.
- No Stories section, story mappings, raw answers, timestamps, or technical wording.
REPORT
The cause of the generation failure and the fix, Christina's full section as text, a screenshot of the CSC-like cheat sheet, files changed, and a full-suite result.
