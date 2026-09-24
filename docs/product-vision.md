# AimedJobSeek: Product Vision

This is the source of truth for what AimedJobSeek is. Read it before any task in this repo. When code and this document disagree, flag it; do not silently pick one.

## What this product is

AimedJobSeek helps job seekers pursue specific jobs with research-backed, personalized materials and outreach in their own voice. It is a fork of Aimed Outreach. Research, persona, voice, generation, claim-guard, billing, auth, and admin capabilities are reused wherever they fit. User-facing names come from `src/lib/product-config/`. Internal table and route names stay (Product, ICP, Persona, Campaign) to avoid a rename.

## Settled decisions

- Separate repo (aimed-jobseek), Render service, and Postgres instance. Full upstream commit history retained.
- Job discovery is cut-and-paste. The seeker finds a posting anywhere and pastes it in. No job-board integrations.
- This repo does not sync with Aimed Outreach.
- Internal identifiers keep their names. Only user-facing text and prompt content change.
- Prompt machinery stays in the shared generation layer. Prompt content lives in `src/lib/prompt-content/`.
- No hardcoded vocabulary or branding. All user-facing terms come from the product configuration module.
- Production-ready code only. No placeholders, stubs, or temporary fixes.
- The EULA is managed by the super admin through the admin console. It is data, not code.
- There is no Microsoft 365 mailbox integration in the product. Outreach is handed off to Outlook desktop, Outlook on the web, and Gmail. The seeker sends from their own mailbox.
- Lists, list import, bulk validation, bulk scoring, and list-to-persona matching are not in the product. The seeker adds contacts one at a time on an application.
- Hiring Team roles are identified per application from the job requirement and employer research. Personal Profile build does not create them.
- Standard plan only in the seeker UI. Each account is an organization of one.

## The user journey

Setup order: Personal Profile → Target Employers → Applications.

1. **Personal Profile.** The seeker uploads a resume and other documents, pastes LinkedIn text, and adds notes. The profile is built from supplied materials only — no web search for the person. Synthesis does not generate Hiring Team roles.
2. **Target Employers.** The seeker describes the kind of company they want (culture, stage, size, industry, geography, work arrangement). Multiple profiles are allowed; when only one exists it is selected automatically.
3. **Application.** The seeker pastes a job posting and selects a Target Employer profile. The system parses a structured job requirement, identifies the company, runs employer research, shows employer-fit as a non-blocking signal the seeker can override, identifies Hiring Team roles for this application, and keeps a roster of contacts added one at a time.
4. **Consultation.** Harper compares the job requirement to the Personal Profile and runs a Q&A to surface specific, citable details. Confirmed answers and STAR stories write back to the Personal Profile. The seeker can skip the consultation, skip a question, pause, or mark Done. Answers are seeker-authored FACT for claim guards.
5. **Application assets**, generated per application, fail closed on untraceable claims:
   - Tailored resume (DOCX on demand)
   - Cover letter (DOCX on demand)
   - Email and LinkedIn outreach to a Hiring Team contact
6. **Interview stages.** The seeker records stages, interviewers (who become roster contacts), notes, and outcomes. Each stage has a guide. Thank-you and check-in messages are generated only after notes exist. Thin notes can ask up to two clarifying questions; the seeker's answers are FACT for that stage's thank-you generation and claim validation.
7. **Application Summary.** A printable recap of the job, employer research, Hiring Team, consultation, assets, outreach, and interview stages.

## Hiring Team

Roles are the people involved in hiring and in the day-to-day work of the role. They are identified per application from the job requirement and employer research, then drafted and reviewed. The seeker can save a role as a template and add a template to an application; templates never auto-populate. Contacts are real people (name, title, optional email, LinkedIn URL, role). Title-to-role matching is suggested; the seeker can change it.

## Claim guards

No generated asset may state a skill, title, employer, date, credential, metric, or achievement that cannot be traced to the Personal Profile, a confirmed consultation answer, or — for a thank-you — a seeker-authored clarifying answer for that stage. Assets may emphasize and order facts but never add them. Resume, cover letter, LinkedIn, and outreach fail closed on an untraceable fact.

## Concept mapping (user-facing names)

| Internal name | User-facing name |
|---|---|
| Product | Personal Profile |
| ICP | Target Employer profile |
| Persona | Hiring Team role |
| Campaign | Application |
| Contacts | Contacts |
| Campaign email settings | Application guidance |

## Built capabilities

- Job posting parser and structured job requirement
- Per-application Hiring Team identification, review, and optional templates
- One-at-a-time contact add with role suggestion
- Consultation that writes confirmed facts and stories back to the Personal Profile
- ApplicationAsset generation for resume, cover letter, email, and LinkedIn, with DOCX on demand
- Desktop and web email handoff (Outlook desktop, Outlook on the web, Gmail). No connected-mailbox send path
- Interview stages, guides, notes, clarifying questions, thank-you and check-in outreach
- Application Summary
- Two reminder clocks on Home and in the digest: application outreach after a send, and interview thank-you / check-in after the interview date

## Decisions log

- Target Employers stays. `Campaign.icpId` remains required. Employer-fit is a visible, overridable signal, never a block.
- Lists and list scoring are not product features. Hidden list/scoring routes are leftover machinery, not a seeker path.
- Contacts are added one at a time. Interviewers recorded at a stage become roster contacts.
- Email and LinkedIn outreach require a contact. Email handoff needs an address; LinkedIn paste does not.
- Resume, cover letter, and LinkedIn copy are `ApplicationAsset` rows. DOCX is rendered on demand, not stored.
- There is no Microsoft Graph send or attachment path in the product. Handoff links cannot attach a file; the UI provides a download for documents.
- Personal Profile build does not return suggested buyer roles and does not prompt for a Hiring Team role.
- Cadence uses two clocks, both on Home and in the digest:
  1. Application outreach, anchored to sends, with job-seeker intervals.
  2. Interview stages, anchored to the interview date. A thank-you comes due about 24 hours after; a check-in comes due if there is no response N days later. Content is generated on demand after notes, never on a timer.
- Thank-you clarifying answers are seeker-authored FACT for that stage. They are available to thank-you generation and claim validation.
- Standard plan only in the seeker UI. Seats, invites, team roles, Contact Sales, Premium, and Enterprise stay in code and are hidden.
- Claim rule: every asset fact traces to the Personal Profile, a consultation answer, or a stage thank-you answer. Fail closed.
