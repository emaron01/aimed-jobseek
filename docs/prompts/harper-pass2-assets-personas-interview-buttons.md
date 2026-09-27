Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below. Pass 3 of the approved plan comes later; do not start it.

TASK: Pass 2 of the approved plan: resume and cover letter, Personas and Interviewers contact picker, and interview stage buttons (plan items 5, 6, and 8), with the decisions below. Work on main. Commit and push when all checks pass.

1. Resume and cover letter (plan item 5)
- Show only the finished documents: the document, its versions, Approve, and Download DOCX.
- Hide Harper's plan panel (plan text, Accept, Adjust plan) from view. Keep plan rows and plan generation; plans are accepted automatically whenever generation or regeneration needs them, including on existing applications with draft plans.
- Remove the list that repeats every line as an edit box. Editing happens in place in the document, with one Save as new version.
- Each document has Regenerate with a "What should Harper change?" box. Harper uses the input to rewrite that document. Do not show the typed instruction back on the version.
- Version headers read "Version N · Draft" or "Version N · Approved", with no clock time.
- "Ready" notices show once per document, not repeated (production showed "Cover Letter is ready. View it" four times).

2. Personas and Interviewers contact picker (plan item 6)
"I know who is interviewing me in this group" offers the same two paths as interview stages: choose an existing contact from this application, or add a new one. Choosing a contact already assigned to another persona moves them to this one. Adding a person never builds the persona automatically.

3. Interview stage buttons (plan item 8)
- The open stage is the earliest stage with no outcome.
- Next to it: "Add newly gained information here". What is entered regenerates that person's cheat sheet section and queues Harper's reassessment, so Harper uses it, not just saves it. Keep the existing in-panel form.
- Next to it: "Review open questions for this interview", which opens the Interview Cheat Sheet filtered to that interviewer and scrolled to their likely questions. When the stage has no interviewer, the button is disabled and the existing "choose who you are meeting" control stays.

TESTS
- The resume and cover letter page shows no plan text and no repeated edit-box list; in-place edits save a new version; Regenerate with instructions rewrites the document; existing draft plans are accepted automatically; version headers have no clock time; each ready notice shows once.
- The persona picker lists existing contacts and adds new ones; choosing a contact from another persona moves them; no automatic build.
- The open-stage buttons appear on the earliest stage without an outcome; new information regenerates the person's cheat sheet section and queues reassessment; the review button opens that person's likely questions; it is disabled with no interviewer.

REPORT
What changed, screenshots of the resume page, the persona picker, and the interview stage buttons, files changed, and a full-suite result.
