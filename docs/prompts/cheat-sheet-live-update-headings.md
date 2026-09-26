SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below.

TASK: Fix three Interview Cheat Sheet defects seen in production. Work on main. Commit and push when all checks pass.

1. The page kept spinning after generation finished and only showed the result after a manual browser refresh. The cheat sheet page must update on its own when its generation job completes or fails, with no refresh.
2. The shared top section has the wrong content under two headings:
   - "Company background" describes the seeker's career. It must describe the company (what they do, customers, size, and relevant context from company research).
   - "The job requirements" lists the seeker's gaps. It must summarize the job's actual requirements and key outcomes from the job posting.
   "Where you shine" is correct; leave it as is.
3. The Company section's Customers list ends with a stray "Not stated." When a list has items, never append "Not stated."; use it only when the list is empty.

TESTS
- The cheat sheet page updates without a refresh when generation completes and when it fails.
- "Company background" describes the company from research, and "The job requirements" summarizes the posting's requirements, never the seeker's background or gaps.
- "Not stated." appears only for empty lists.

REPORT
What changed, the regenerated top section for the CSC-like application, files changed, and a full-suite result.
