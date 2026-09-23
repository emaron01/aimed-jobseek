# Resume and cover letter per application, as DOCX

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

Read docs/product-vision.md and docs/refactor-map.md before starting. Follow the prompt content layer pattern in src/lib/prompt-content/. No product code may write narrative text; the model writes, product code validates, organizes, and renders.

TASK: Resume and cover letter per application, as DOCX. Work on main. Commit and push when all checks pass.

WHY
This turns the Personal Profile and Harper's consultation into what the seeker actually submits. Every claim must be true and traceable; a fabricated line on a resume is the worst failure this product can have.

1. ApplicationAsset model (new)
Fields: application (Campaign), type (RESUME or COVER_LETTER for this task), optional Hiring Team persona, version number, structured JSON content, the claim trace (which FACT item or approved statement supports each claim), the guidance that produced it, prompt version, status (DRAFT or APPROVED), and timestamps. Each regeneration creates a new version; the seeker approves one version per type. Earlier versions remain viewable and downloadable.

2. Shared generation context
Split the email generation context loader so application, Personal Profile, story bank, approved statements, job requirement, company research, consultation assessments, and an optional persona load without a contact. Email keeps adding the contact on top. Assets use the contact-free context. Adapt the existing machinery; do not copy it.

3. Personal Profile contact details
Add contact fields to the Personal Profile identity: email, phone, city and state, LinkedIn URL, and personal site. The seeker enters or confirms them; they are FACT items. The resume header uses only these.

4. Resume
- Structure: header; a short summary tailored to this job; experience in reverse chronological order; skills; education and credentials. Section headings from configuration.
- Tailoring means selecting, ordering, and emphasizing. Use the Personal Profile's achievements and the seeker's approved resume bullets from consultation. Preserve the seeker's original wording where it is already strong; rewrite only for clarity, relevance, or banned phrasing.
- Include the posting's language only where it truthfully describes the seeker's experience.
- Employers, titles, and dates appear exactly as on the Personal Profile. Never change or estimate a date.
- All roles are included by default. The seeker can hide a role; the system never hides one on its own.
- Target length by seniority, from configuration.

5. Cover letter
- Addressed to the Hiring Manager role. Use the contact's name if one is on the application roster; otherwise a professional salutation from configuration.
- Opening connects to something specific about this company from company research (cited source).
- Body: the one or two strongest stories mapped to the role's most important outcomes, using approved statements where they exist.
- Addresses a significant gap only when Harper's strategy for it is to acknowledge it.
- Close with a clear, confident ask.
- Tone from the seeker's existing voice samples. Short: three to four paragraphs.

6. Claim rule: fail closed
Every skill, title, employer, date, credential, metric, and achievement must trace to a Personal Profile FACT item or an approved consultation statement. Product code verifies the trace. Untraceable content is removed and the asset is regenerated. If it still fails, the asset is not saved; show the violations and a retry action. Never save an asset with an untraceable claim.

7. Writing quality
- Run every asset through the configured banned-phrase and meta-language checks and regenerate on a hit.
- Add an ASSET_AI model role following the existing pattern, with a moderate temperature for writing. Validation and extraction stay at temperature 0. Report the environment variables to add.
- Application guidance and a per-asset "What should change?" instruction apply on regeneration, as with email.

8. DOCX rendering
- Render from the structured JSON on demand; do not store files.
- ATS-safe layout: single column, standard headings, no tables, text boxes, images, or text inside headers or footers, and standard fonts. Style values (font, sizes, margins, spacing) come from configuration.
- Download is available for any version. PDF output is out of scope for this task.

9. Workspace
Add Resume and Cover Letter to the application workspace: generate, view, edit text, regenerate with instructions, approve, see the version history, and download DOCX. Show which source supports each claim when the seeker hovers over or selects it.

TESTS
- No claim without a trace is ever saved; resume generation fails closed.
- Dates, employers, and titles match the Personal Profile exactly.
- Roles are never hidden automatically; the seeker's hide choice is respected.
- The cover letter cites a research source in its opening and uses the roster contact's name when present.
- Banned phrases trigger regeneration.
- The DOCX contains no tables, images, text boxes, or header or footer text, and uses the configured styles.
- Versions increment and only one version per type is approved.
- The contact-free context loads without a contact, and email generation still works.

REPORT
All sample output must come from real model calls, not fixtures or test doubles. Using the fixture resume and the normal fixture posting: the full resume text with its claim trace, the full cover letter, any claims removed by the fail-closed check, and a description of the DOCX structure. Also migrations, prompt versions, new environment variables, files changed, and anything that could not meet this standard.
