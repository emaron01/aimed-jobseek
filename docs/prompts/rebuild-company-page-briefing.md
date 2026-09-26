Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Rebuild the application's Company page as the Aimed Outreach company briefing. Work on main. Commit and push when all checks pass. Change nothing else.

1. Layout: use the Aimed Outreach company briefing screen (the "Company briefing" page in this repository, used by the list flow): company name, domain, last researched date, the sources read with their links, and readable sections with source citations. Use job-seeker wording from the vocabulary module; no sales language (for example, not "Prospect intelligence for meeting prep", "Product/ICP fit", or "Back to lists").
2. Remove the sales sections: Estimated AOV, AOV reasoning, and Buying signals. Keep the other sections.
3. What they do: this is the most important section. Update the company research prompt content so it captures as much detail as possible about the company's services and products. Bump the prompt version.
4. The only action is Regenerate (rerun the research). Remove the always-open edit form and the duplicated content it shows.
5. Add a collapsible section, collapsed by default, where the seeker can paste text: information research could not find, or an area they are interested in. Pasted text is saved and used as an additional source when the seeker clicks Regenerate.

TESTS
- The Company page uses the briefing layout with sources and citations.
- Estimated AOV, AOV reasoning, and Buying signals do not appear.
- Regenerate is the only action; no edit form or duplicated content renders.
- Pasted text is saved and included as a source on Regenerate.

REPORT
What changed, the research prompt version, a screenshot of the Company page for the CSC application, files changed, and a full-suite result.
