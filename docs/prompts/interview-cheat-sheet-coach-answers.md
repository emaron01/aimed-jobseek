Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Make the Interview Cheat Sheet coach with real answers, in the seeker's voice. Work on main. Commit and push when all checks pass. Change nothing else.

Today the cheat sheet tells the seeker what to prepare ("Be ready to explain exactly which KPIs you changed...", "Prepare a clear answer on how MEDDPICC was used...", "bring a concrete manager-development example only if Erik can substantiate it"). A coach gives the answer. It also speaks about the seeker in third person ("Erik brings...", "Erik is currently...").

1. Sample answers: every likely question, every hiring manager drill-down, and every "flag to address honestly" gets a sample answer written by Harper from the seeker's real experience, in the seeker's voice, ready to say out loud.
2. Harper asks when she needs more: when Harper does not have enough to write a good sample answer, she asks the seeker a question right under that item, with an answer box (for example: "Have you developed a front-line manager? Tell me what wasn't working and what changed."). When the seeker replies, Harper writes the sample answer from it.
3. Remove every "be ready to", "prepare", "expect questions on", and similar instruction to go prepare. Each is replaced by a sample answer or by Harper's question.
4. Answers the seeker gives Harper on the cheat sheet are saved the same way as Harper's Q&A answers: to the Personal Profile and story bank, available to the resume, cover letter, and every section of the cheat sheet.
5. First person: everything on the cheat sheet that describes the seeker is written in first person ("I have...", "I lead..."), never third person ("Erik has...", "Erik is...").

TESTS
- Every likely question, drill-down, and flag shows either a sample answer or Harper's question with an answer box.
- A reply to Harper's question produces a sample answer and is saved to the Personal Profile and story bank.
- No "be ready to", "prepare", or "expect questions" instructions remain.
- No third-person references to the seeker appear on the cheat sheet.

REPORT
What changed, sample output for the CSC application's hiring manager section (three likely questions with their sample answers, and one Harper question), files changed, and a full-suite result.
