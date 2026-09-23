# AimedJobSeek: Product Vision and Refactor Playbook

This is the source of truth for what this codebase is becoming. Read it before any task in this repo. When code and this document disagree, flag it; do not silently pick one.

## What this product is
AimedJobSeek helps job seekers pursue specific jobs with research-backed, personalized materials and outreach in their own voice. It is a fork of Aimed Outreach, an outbound sales email tool. The fork's research, persona, voice, generation, claim-guard, sequencing, sending, billing, auth, and admin capabilities are reused wherever they fit.

## Settled decisions
- Separate repo (aimed-jobseek), Render service, and Postgres instance. Full upstream commit history retained.
- Job discovery is cut-and-paste. The seeker finds a posting anywhere and pastes it in. No job-board integrations.
- This repo does not sync with Aimed Outreach.
- Internal identifiers (tables, columns, models, services, routes) keep their names to avoid the cost and risk of renaming, not for mergeability. Only user-facing text and prompt content change.
- Prompt machinery (context assembly, fact selection, claim-guard mechanics, length control, voice application, versioning) stays in the shared generation layer. Prompt content (instructions, examples, structure) is product-specific and lives in its own layer, for clarity.
- No hardcoded vocabulary or branding. All user-facing terms come from a single vocabulary source. This has caused repeated production problems and is non-negotiable.
- Production-ready code only. No placeholders, stubs, or temporary fixes.
- The EULA is managed by the super admin through the admin console. It is data, not code.

## The user journey
Setup order: Profile → Target Employers → Applications.

1. Profile: the seeker uploads a resume and other documents, pastes their LinkedIn profile, and adds notes. The profile is built from the seeker's supplied materials (uploads, pasted text, notes, and supplied URLs), with no web search for the person. This reuses product intake (uploads, paste, notes, URLs, Research & Build). Unlike product build, profile build does NOT generate personas and does not suggest buyer roles. The setup rail does not prompt for a persona after the profile.
2. Target Employers: the seeker describes the kind of company they want to work for (culture, stage, size, industry, geography, work arrangement). This is the upstream ICP, with prompt content rewritten for employers; the model and scoring pipeline are reused. Multiple Target Employer profiles are allowed; when only one exists it is selected automatically.
3. Application: the seeker pastes a job posting and selects a Target Employer profile. The system:
   - parses it into a structured job requirement
   - identifies the company and runs company research (reused; research emphasis shifts from buying signals to hiring, growth, and employer-risk signals)
   - scores the company against the Target Employer profile using the existing ICP scoring; a mismatch is a visible signal the seeker can override, never a block
   - builds hiring-team personas for this application
   - keeps a roster of contacts, added one at a time
4. Consultation: the system compares the job requirement to the candidate profile and runs an interactive Q&A with the seeker to surface strong, specific details that set them apart from other applicants. Answers are written back to the master candidate profile, not just this application, so the profile improves with every application. Consultation answers are verified facts for claim guards.
5. Assets, generated per application:
   a. Tailored resume (document output, rendered as DOCX on demand)
   b. Cover letter (document output, rendered as DOCX on demand)
   c. Email, on demand, to a hiring-team contact who has an email address
   d. LinkedIn message copy for pasting into LinkedIn outreach, per persona
6. Interviews:
   a. An interview guide per stage: overview, talking points, and questions to ask, by persona. Generic when little is known; curated from information already shared.
   b. Stage updates: the seeker records what they learned (for example, "the recruiter says the next interviewer focuses on X"), and the next stage's guide adapts. The system may ask the seeker a few clarifying questions. Interviewers recorded at a stage become contacts on the application's roster.
   c. Follow-up and thank-you emails and LinkedIn messages per interviewer, based on persona and interview notes. These come due on the interview-stage clock (see Decisions log) and are generated only after the seeker records notes.

## Personas are the hiring team
Personas are the people involved in hiring and in the day-to-day work of the role: HR, recruiters, the hiring manager, the hiring manager's executive, and cross-functional team leaders. Each is defined by their relationship to the role's responsibilities and what matters to them. Personas drive outreach, interview guides, and follow-ups.
- A stakeholder template library exists at the account level. Templates are instantiated and researched per application.
- The custom persona builder (name, likely titles, department, why this role matters, notes) is reused. Its evidence source changes from product evidence to job requirement plus company research, plus differentiation from peer personas so the recruiter, hiring manager, and executive stay distinct.
- Personas are created per application. Profile build does not create them.
- Contacts are real people at the company, added one at a time to an application's roster (name, title, optional email, LinkedIn URL, persona). Title-to-persona matching is suggested automatically and the seeker can change it.

## Guidance and regeneration
Existing two-level guidance is reused: campaign-level guidance becomes application-level guidance, and per-draft "What should change?" applies to every asset type.

## Claim guards
Claim guards must protect candidate facts. No generated asset may state a skill, title, employer, date, credential, metric, or achievement that cannot be traced to the candidate profile or consultation answers. Assets may emphasize and order facts but never add them. Fabrication on a resume is a far more serious failure than in a sales email: resume generation fails closed on an untraceable fact.

## Proposed concept mapping (user-facing names only; proposed, except Target Employers, which is confirmed)
| Upstream concept | Job seeker concept |
|---|---|
| Product | Profile |
| ICP | Target Employers (confirmed) |
| Persona | Hiring Team stakeholder |
| Campaign | Application |
| Contacts | Contacts |
| Campaign email settings | Application guidance |

## Genuinely new capabilities
- Job posting parser into a structured job requirement
- Per-application persona scoping with an account-level template library
- Interactive consultation agent (multi-turn Q&A) that writes back to the profile
- Generalized asset generation (resume, cover letter, email, LinkedIn) sharing one context, fact-selection, and claim-guard chain, with type-specific format and length constraints. Resume, cover letter, and LinkedIn copy are stored as structured content in a new ApplicationAsset model; DOCX is rendered from that content on demand, not stored as a file.
- Attachments on send through Microsoft Graph for connected Microsoft 365 mailboxes, and a download step for handoff paths that cannot attach
- Interview stages with carried-forward notes, stage guides, per-interviewer follow-ups, and an interview-date clock for thank-you and check-in reminders

## Decisions log
- Target Employers (ICP) stays. It describes the kind of company the seeker wants to work for. `Campaign.icpId` remains required. Every application is scored against a Target Employer profile using the existing ICP scoring; a mismatch is a visible signal the seeker can override, never a block. Multiple Target Employer profiles are allowed; when only one exists it is selected automatically. Setup order: Profile → Target Employers → Applications. The ICP prompt content is rewritten for employers (culture, stage, size, industry, geography, work arrangement); the model and scoring pipeline are reused.
- Lists: list import, bulk validation, bulk scoring, and list-to-persona matching are not requirements. The code stays; the UI is hidden.
- Contacts: added one at a time to an application's roster. Fields: name, title, email (optional), LinkedIn URL, persona. Title-to-persona resolution reuses the existing resolved-persona logic, and the seeker can change it. Interviewers recorded at an interview stage become contacts on the roster.
- Emails require a contact with an email address. `EmailDraft` and its contact relation are unchanged.
- Resume, cover letter, and LinkedIn message copy are a new ApplicationAsset model: type, application, persona (optional), version, structured JSON content, and the guidance that produced it. No contact is required. DOCX is rendered from the structured content on demand, not stored as a file. All asset types share the context, fact-selection, and claim-guard chain used by email generation.
- Attachments: Graph `sendMail` with `fileAttachment` for connected Microsoft 365. Handoff paths (Outlook desktop, Google Workspace) cannot attach; the UI must provide a download step for those paths.
- Profile build does not return `suggestedBuyerRoles`, and the setup rail does not prompt for a persona after the profile. Personas are created per application.
- Cadence uses two clocks, both surfaced on Home and in the digest:
  1. Application outreach: the existing sequence clock, anchored to the first send, with job-seeker default intervals.
  2. Interview stages: anchored to the interview date recorded on the stage. A thank-you comes due within about 24 hours of the interview; a status check-in comes due if there is no response N days after it. The due item prompts the seeker to record notes. Content is generated on demand only after notes are recorded, never on a timer.
- Standard plan only. Each account is an organization of one. Seats, invites, team roles, member management, Contact Sales, Premium, and Enterprise stay in code but are hidden from the UI. Stripe exposes one plan. Plan limits are set by configuration, not hardcoded, and will be defined per application or generated asset rather than per email.
- Claim rule for every asset: a skill, title, employer, date, credential, metric, or achievement may appear only when it traces to the candidate profile or a consultation answer. Assets may emphasize and order facts but never add them. Resume generation fails closed on an untraceable fact.
- The concept mapping table remains proposed, except Target Employers, which is confirmed.
