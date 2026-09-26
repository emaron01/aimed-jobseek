SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Replace the Personal Profile edit form, and make LinkedIn optional. Work on main. Commit and push when all checks pass.

PROBLEM
The Personal Profile edit page (/setup/[productId] edit) is still the sales product form: "Personal Profile Name", "Website URL", "Personal Profile Description", "Primary Value Proposition", "Typical Price / AOV". The resume workspace also lists a missing LinkedIn URL as a problem, although many jobs do not need LinkedIn.

1. Personal Profile edit form
Replace it with a form for everything the candidate profile holds and a resume needs:
- Identity and contact: full name, headline, city and state, phone, email, LinkedIn URL (optional), personal website (optional).
- Positioning statement and career direction (target titles, functions, seniority, goals).
- Experience: each role's employer, title, start and end dates exactly as the seeker writes them (month-year or year only, or Present), location, summary, and achievements. Add, edit, reorder, and remove roles and achievements.
- Skills, education, credentials, and awards.
Seeker edits are saved as FACT and protected from being overwritten by rebuilds, as manuallyEditedFields does today. Remove every sales product field from seeker-facing views: website URL as a product, value proposition as a product, price, AOV, and anything else inherited from product setup. Internal columns stay; they are simply not shown.
Audit every other seeker-facing page reachable from the Personal Profile, Target Employers, and Hiring Team for remaining product-setup fields, and convert or remove them.

2. LinkedIn is optional
- The resume header includes LinkedIn when present and omits it silently when absent.
- Never list LinkedIn (or a personal website) as missing. Only phone and email are suggested when missing, as a gentle note with a link to the edit form, never a requirement.

TESTS
- The edit form shows candidate fields only; no product, price, or AOV field renders anywhere seeker-facing.
- Role dates save exactly as written, including year-only and Present.
- Seeker edits survive a profile rebuild.
- A resume without LinkedIn shows no warning about it.

REPORT
The old fields removed, the new form's sections, any other product-setup fields found and converted, files changed, and a full-suite result.
