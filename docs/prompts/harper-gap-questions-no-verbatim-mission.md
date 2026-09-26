Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Fix Harper's gap questions. Work on main. Commit and push when all checks pass. Change nothing else.

Production, Harper asked: "Do you have experience with Join us to help protect the world's most valuable digital brands while building a disciplined, world-class sales organization defined by execution excellence, leadership depth, and sustainable growth. that Harper does not see?" This is a code template that pastes requirement text verbatim, and it treats the company's mission statement as a skill gap.

1. Remove the code template. Every gap question is written by Harper (the model), in natural language, specific to the gap and to the seeker's background, the way an experienced recruiter would ask it. Posting text is never pasted verbatim into a question.
2. Mission statements and company taglines are not experience gaps. Never ask whether the seeker has experience with a mission statement.
3. Search for any other code that inserts requirement or posting text into Harper's questions or messages, and remove it the same way. List every place found.

TESTS
- No Harper question contains verbatim requirement or posting text inserted by code.
- No question asks about experience with a mission statement.

REPORT
The template removed, every other place found and fixed, three real gap questions Harper now writes for the CSC application, files changed, and a full-suite result.
