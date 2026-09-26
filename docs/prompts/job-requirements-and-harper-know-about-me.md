Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Rebuild the Job requirements page, and add "What You Should Know About Me" to Harper. Work on main. Commit and push when all checks pass. Change nothing else.

PART 1: Job requirements page
Today the page shows the same information three times (a read-only view, an always-open form repeating every field, and the scorecard twice), has no Regenerate, and shows a confusing employer fit ("Good fit (scored Needs review)", with criteria listed but no results).
1. One read-only view, shown once: title and basics, responsibilities, required, preferred, and the scorecard.
2. Remove the always-open field-by-field edit form.
3. Two actions:
   - Edit posting: opens the original pasted posting text for the seeker to correct or replace. Saving regenerates the job requirements from it.
   - Regenerate: regenerates the job requirements from the posting and the seeker's notes.
4. "What I've learned": a free-form notes section, collapsed by default, where the seeker adds what they learn at any time (for example, after a call with an interviewer). Notes are saved, included when the job requirements regenerate, and used by Harper and the Interview Cheat Sheet.
5. Remove the "Inferred" tag from every scorecard item. Add this note to the scorecard: "This scorecard is based on your Personal Profile and the job posting. The more Harper knows about you, the more it may change."
6. Employer fit: scored automatically whenever the job requirements or company research regenerate. Show the rating with a one-line reason for each criterion (met, missed, or not stated), and the seeker's override. Remove the separate save form.

PART 2: Harper, "What You Should Know About Me"
1. Add a "What You Should Know About Me" button on the Harper page. It opens a free-form box where the seeker tells Harper about background she does not see (for example: "I have 9 years of security sales; the resume I gave was focused on a non-security job").
2. What the seeker writes is saved to their Personal Profile as seeker-stated fact, so it applies to every application.
3. After saving, Harper reassesses "Where you stand" for this application using the new information.
4. The resume and cover letter show that new information is available, with Regenerate. They are not regenerated automatically.
5. Harper's drafted questions must ask about the gaps in "Where you stand": for each important gap, ask whether the seeker has experience Harper does not see, before treating it as a gap.

TESTS
- The job requirements appear once; no field-by-field edit form renders.
- Edit posting saves the posting text and regenerates the job requirements; Regenerate works.
- "What I've learned" notes save, feed regeneration, and reach Harper and the Interview Cheat Sheet.
- No "Inferred" tags; the scorecard note appears.
- Employer fit shows a reason per criterion and updates on regeneration.
- "What You Should Know About Me" saves to the Personal Profile, triggers reassessment, and marks the resume and cover letter as having new information.
- Harper's questions include gap questions asking whether the seeker has unseen experience.

REPORT
What changed in each part, screenshots of the Job requirements page and the Harper page with the new button, files changed, and a full-suite result.
