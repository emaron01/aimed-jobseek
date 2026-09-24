# Refactor map

Audit of this repo against `docs/product-vision.md`. Report only. No code was changed to produce it.

This workspace's only git remote is `https://github.com/emaron01/aimed-jobseek.git`. There is no Aimed Outreach remote checked out here, so "wrong in upstream" in section 7 is judged from this history, not from a diff against another tree.

The vocabulary classifications cited below are from `docs/vocabulary-audit.md`.

## 1. System overview

**Stack.** Next.js 16.3.1 App Router, React 19, TypeScript, Tailwind CSS 4. Package name in `package.json` is `email-platform`. Server actions live under `src/app/actions/`. The UI is server components plus client components in `src/components/`.

**ORM and database.** Prisma 6 against PostgreSQL (`prisma/schema.prisma`, `DATABASE_URL`). The client is generated with the binary engine. Tests use a separate database (`docker-compose.yml`, `TEST_DATABASE_URL`). `scripts/db-safety-check.mjs` refuses to migrate a database whose name looks like SalesForecaster.

**Background work.** There is no Redis or job-queue library.

- Company research batches are rows in `ResearchRun`. `scripts/research-worker.ts` polls every 5 seconds, claims a run, and calls `processResearchRun` in `src/lib/research/runs-service.ts`. On Render this is a separate process (`npm run research:worker:render`). The web service owns migrations via `scripts/render-pre-deploy.mjs`. The worker waits until the `ResearchRun` table exists and does not migrate.
- The cadence digest is not an in-process cron. `POST /api/jobs/cadence-digest` (`src/app/api/jobs/cadence-digest/route.ts`) runs `runCadenceDigestJob` when called with `Authorization: Bearer $CRON_SECRET`. The comment in that file says to schedule it from Render (about every 15 minutes on weekdays).

**LLM providers.** All model configuration is in `src/lib/ai/config.ts`. Eight roles, each with its own env vars (`provider`, `model`, `modelUrl`, `apiKey`, timeout, retries, temperature): `research`, `scoring`, `interpretation`, `contact_research`, `product`, `persona`, `email`, `email_facts`. Providers implemented: `openai-compatible` (chat completions) and `openai-responses` (Responses API). Research is the role that turns on web search. Product and persona roles can set `reasoning.effort`. There is no Anthropic, Gemini, or other vendor adapter in `src/lib/ai/providers/`. The admin screen for this is `src/app/platform/ai/page.tsx`. Role labels and which operations they unlock are in `src/lib/ai/roles.ts`.

**Third-party services.**

| Service | Where | What it does |
| --- | --- | --- |
| Stripe | `src/lib/billing/`, `src/app/api/billing/` | Checkout, portal, webhooks, seats, company-research credit packs, referral coupons |
| Microsoft Graph | `src/lib/mailbox/microsoft-graph.ts`, `src/app/api/mailbox/microsoft/` | Delegated mailbox connect and `sendMail`. `MailboxProvider` is only `MICROSOFT_365` |
| Better Auth | `src/lib/auth/better-auth.ts`, `src/app/api/auth/[...all]/route.ts` | Sessions, email verification, password reset, OAuth account rows |
| Transactional email | `src/lib/transactional-email/` | Console, SMTP (nodemailer), or Resend. Not the user's mailbox |
| Web search | Inside the research AI provider | Used by company research, contact research, and product source discovery |

Document intake uses `pdf-parse` and `mammoth` (DOCX **read**) in `src/lib/product-research/extract.ts`. Spreadsheet import uses `xlsx` and `papaparse`. Nothing in the repo writes a DOCX. `src/components/ExportPdfButton.tsx` calls `window.print()`.

**Directory structure.**

| Path | Purpose |
| --- | --- |
| `src/app/(app)/` | Signed-in product: home, campaigns, lists, contacts, companies, products, ICPs, personas, setup, scoring, settings, support |
| `src/app/(auth)/` | Login, signup, plan pick, verify email, password reset, invite accept |
| `src/app/(onboarding)/` | EULA acceptance and subscribe |
| `src/app/platform/` | Super-admin and support console |
| `src/app/actions/` | Server actions (the write API the UI calls) |
| `src/app/api/` | Auth, Stripe, Microsoft OAuth, cadence cron |
| `src/components/` | UI, including billing, campaign email workspace, product and persona review |
| `src/lib/ai/` | Provider adapters, role config, structured-output schema names |
| `src/lib/auth/` | Session, authorization, invites, audit, rate limit |
| `src/lib/billing/` | Plans, catalog, Stripe, referrals, credits, payment lock |
| `src/lib/cadence/` | Follow-up due dates and the daily digest |
| `src/lib/campaign/` | Campaign save, offer validation, visibility, which personas are in play |
| `src/lib/contact/` and `src/lib/contact-research/` | Contact identity and role research |
| `src/lib/criteria/` and `src/lib/interpretation/` | ICP and persona criteria, evidence class, interpretation prompts |
| `src/lib/email-generation/` | Prompt, context, fact selection, claim guard, sequence, reply |
| `src/lib/import/` and `src/lib/lists/` | Paste and file import of contact lists |
| `src/lib/mailbox/` | Microsoft OAuth, token crypto, Graph send |
| `src/lib/org/` and `src/lib/tenant/` | Org membership, seats, tenant-scoped reads and deletes |
| `src/lib/persona/` and `src/lib/persona-research/` | Persona save, differentiation, staged research |
| `src/lib/product/` and `src/lib/product-research/` | Product save, source acquisition, synthesis |
| `src/lib/research/` | Company research prompts, runs, worker claim loop |
| `src/lib/scoring/` | Fit scoring, title suggestions, disqualifiers |
| `src/lib/legal/` | EULA seed and acceptance |
| `src/lib/platform/` | Org admin, cost, purge, settings |
| `src/lib/suppression/` | Do-not-email |
| `src/lib/transactional-email/` | System mail templates and send |
| `src/lib/usage/` | Quotas, usage events, alerts |
| `src/lib/voice/` and `src/lib/signature/` | Writing samples and signatures |
| `src/lib/workflow/` | Home setup rail and campaign stage list |
| `prisma/` | Schema, migrations, seed |
| `scripts/` | Worker, bootstrap, safety check, ad-hoc research validators |
| `public/` | `window.svg`, `file.svg`, `vercel.svg`. No app favicon or manifest |

## 2. Existing capabilities inventory

Disposition is against the vision: **keep** (use as-is), **adapt** (same machinery, different content or scope), **hide** (works, but the journey does not use it; do not delete until a decision), **irrelevant** (no job-seeker use found).

| Capability | What it does | Where | Disposition |
| --- | --- | --- | --- |
| Sign-up, login, email verification, password reset | Better Auth plus app pages | `src/lib/auth/`, `src/app/(auth)/` | Keep |
| Organizations, memberships, invites, roles OWNER/ADMIN/MEMBER | Tenant boundary for every row | `Organization`, `OrganizationMembership`, `OrganizationInvitation`; `src/lib/org/`, `src/lib/tenant/` | Keep. Vision's "account" is this org, not a new table |
| Individual vs enterprise account type | `INDIVIDUAL` blocks member invites unless comped | `OrganizationAccountType`, `src/lib/org/seats.ts` | Keep the mechanism. Whether job seekers are always individual is an open question |
| Platform console | Orgs, support, AI config, email templates, billing prices, catalog, EULA, costs | `src/app/platform/`, `src/components/PlatformConsoleNav.tsx` | Keep |
| EULA as data | Versions, publish, per-user acceptance. Console edits after seed | `EulaVersion`, `UserEulaAcceptance`, `src/lib/legal/eula.ts`, `src/app/platform/eula/page.tsx` | Keep. The seed body in `src/lib/legal/eula-seed.ts` is still code. See section 7 |
| Onboarding gate | Accept EULA, then subscribe | `src/app/(onboarding)/` | Keep |
| Stripe checkout, portal, trials, payment lock | Unpaid orgs are pushed to billing | `src/lib/billing/`, `src/lib/billing/payment-lock-gate.ts` | Keep the gate. Adapt what a plan includes |
| Seats and shared campaigns | Team plan is 2–10 seats. Campaigns can be PERSONAL or shared. Owner edits; others may copy | `src/lib/org/seats.ts`, `src/lib/campaign/visibility.ts`, `Campaign.visibility` | Hide until teams are in the journey. The code is real, not a stub |
| Referral coupons | Share text plus Stripe percent-off coupons | `src/lib/billing/referral-share-message.ts`, `scripts/create-referral-coupons.ts` | Adapt the sentence. Keep the coupon mechanic if referrals stay |
| Company-research credits | Blocks of 100 companies, 12-month expiry, checkout quantity | `CompanyResearchCredit`, `src/lib/billing/company-research-credits-math.ts` | Adapt the unit. One pasted job is one company, not a list of hundreds |
| Usage quotas and alerts | Daily email, monthly email, daily AI generation, research allowance | `OrganizationUsagePolicy`, `UsageQuotaLedger`, `src/lib/usage/` | Adapt limits. The ledger can stay |
| Usage events and cost console | Token counts and a margin screen | `UsageEvent`, `src/app/platform/costs/page.tsx`, `src/lib/platform/cost.ts` | Keep |
| Transactional email | Verify, welcome, reset, invite, digest, usage warning, support ticket | `src/lib/transactional-email/templates.ts` | Keep the sender. Adapt digest copy if cadence stays |
| Cadence and weekday digest | After a send, `nextDueAt` is set. Digest emails the owner how many follow-ups are due | `src/lib/cadence/`, `OrganizationCadencePolicy`, `DailyDigestSend` | Adapt only if interview follow-ups use the same clock. Otherwise hide. It is not interview-aware |
| Support tickets | In-app form, platform queue, internal notes | `SupportTicket`, `src/app/(app)/support/page.tsx`, `src/app/platform/support/` | Keep |
| Microsoft mailbox connect and send | OAuth, encrypted tokens, send from the user's mailbox, signature appended | `src/lib/mailbox/` | Keep. No attachment field is sent. See section 3 |
| Manual "I sent it" | `EmailSentMethod.MANUAL_ASSERTION` and deeplink intent | `EmailDraft`, `EmailSendRecord` | Keep for LinkedIn paste and for mail the user sends themselves |
| Suppression | Org-wide opt-out, bounce, do-not-contact, keyed by normalized email | `EmailSuppression`, `src/lib/suppression/` | Keep if email to hiring managers can be unwanted. The reasons are sales-list reasons and need copy, not a new table |
| Voice samples | One or more pasted samples. Generation uses the first as style | `VoiceSample`, `src/lib/voice/samples.ts`, `src/app/(app)/settings/voice/page.tsx` | Keep. The email prompt's style rules are the application point |
| Signatures | Per-user signature. The model is forbidden to invent a sign-off; the sender appends it | `EmailSignature`, `src/lib/signature/` | Keep for email. Does not apply to LinkedIn paste or DOCX |
| Product intake | URL, pasted text, upload (pdf, docx, txt, md), note. Extract text, fetch URL, synthesize a profile, human approves | `ProductSource`, `ProductSourceType`, `src/components/AddProductMaterialPanel.tsx`, `src/lib/product-research/` | Adapt into the candidate profile. Same intake types fit resume, LinkedIn paste, and notes |
| Product synthesis also suggests buyer roles | `suggestedBuyerRoles` on the product setup run | `src/lib/product-research/prompt.ts`, `src/lib/product-research/contract.ts` | Adapt: the vision forbids persona generation during profile build. This output has to stop on that path, not be renamed |
| ICP definition, criteria, evidence class, tiers | Natural-language definition interpreted into criteria. Primary vs secondary. Targeted-search decisions | `Icp`, `IcpCriterion`, `src/lib/interpretation/icp.ts`, `src/lib/criteria/` | Adapt only if Target Employers is a real saved object. The current ICP is "which companies should we sell to," scored across a list. A pasted job does not need that |
| Persona builder | Name, titles, department, seniority, responsibilities, pain, outcomes, messaging notes, why this role matters. AI research from product evidence. Peer differentiation | `Persona`, `src/components/PersonaForm.tsx`, `src/lib/persona-research/`, `src/lib/persona/persona-differentiation.ts` | Adapt. Evidence source and when it runs must change. The form fields mostly fit a hiring-team stakeholder |
| Lists and contact import | Paste or upload people. Collapse duplicates. Archive cascades | `ContactList`, `src/lib/import/`, `src/components/AddContactsWizard.tsx` | Hide as a prospecting list. A short list of people at one employer can reuse `Contact` without the scoring list |
| Companies | Deduped by domain inside the org. Research is org-scoped and reused across campaigns | `Company`, `CompanyResearch` | Keep the company record. One application resolves to one company |
| Company research | What they sell, who they sell to, markets, model, AOV, technologies, buying signals, risk signals. Identity ambiguity. Freshness. Metered per user who first introduces the company | `src/lib/research/prompt.ts`, `src/lib/research/runs-service.ts` | Adapt the questions. The worker, freshness, ambiguity, and metering stay |
| Contact role research | Public evidence of responsibilities, judged against persona criteria | `ContactResearch`, `src/lib/contact-research/service.ts` | Adapt the criteria it is pointed at. Useful for "what does this hiring manager own" |
| Scoring and qualification buckets | Score a contact at a company against product, ICP, and persona. Buckets shown as "Ready to include", "Check before including", "Left out" | `src/lib/scoring/`, `QualificationBucket`, `src/components/QualificationBuckets.tsx` | Hide from the journey. It answers "is this prospect worth emailing," not "how does this candidate match this job." Consultation is a different comparison |
| Title suggestions | Map unmatched titles onto personas | `src/lib/scoring/title-suggestion-prompt.ts`, `TitleSuggestion` | Adapt only if imported titles still need to be matched to hiring-team stakeholders |
| Campaign | Named effort owned by a user. Requires `productId` and `icpId`. Optional legacy single `personaId` plus `CampaignPersona` for several personas. Offer fields, email length, email guidance, status, archive, personal vs shared | `Campaign`, `src/lib/campaign/save.ts`, `src/app/(app)/campaigns/` | Adapt as the application shell only if those required FKs stay satisfiable. See section 8 |
| Campaign stages | Setup, list, companies, contacts, emails, report | `src/lib/workflow/campaign-stages.ts` | Adapt the stage list. The current stages are the list-scoring funnel |
| Offer and offer validation | Offer name, description, CTA, notes. Semantic check against product claims | `Campaign.offer*`, `Offer`, `src/lib/campaign/offer-validation.ts` | Hide. The vision replaces the offer with application guidance. The `Offer` table is already legacy |
| Two-level generation guidance | Campaign `emailGuidance` plus per-draft "What should change?" | `src/lib/campaign/settings.ts`, `src/components/EmailSequenceWorkspace.tsx` (the label is the string "What should change?"), `src/lib/email-generation/prompt.ts` | Adapt labels and apply the same two levels to every asset type. The precedence rules already exist for email |
| Email generation, sequence, reply | First email, follow-ups that must not repeat the opener, reply classification, claim guard, lookahead drafts | `src/lib/email-generation/` | Adapt email content. Sequence follow-up is not the same as a post-interview thank-you |
| Claim guard | Deterministic bans plus a model check. Rep-authored text and supplied research are trusted. Model inventions are flagged | `src/lib/email-generation/claim-validation.ts`, `src/lib/email-generation/claim-origin.ts` | Adapt the trusted corpus to the candidate profile and consultation answers. Keep the machinery |
| Research worker and run recovery | Claim, stale-run abandon, shutdown leaves in-flight runs resumable | `scripts/research-worker.ts` | Keep |
| Archive, delete, contact collapse | Soft archive preserves scoring history. List archive can cascade. Duplicate contacts collapse with an audit row | `src/lib/tenant/`, `ContactMergeAudit` | Keep |
| Purge of contact and outbound data | Platform action after cancel, with a waiting period | `src/lib/platform/purge-contact-outbound.ts` | Keep as an admin retention tool |
| Admin audit log | Platform actions recorded | `AdminAuditEvent`, `src/lib/auth/audit.ts` | Keep |
| Rate limiting | Buckets for auth and similar | `RateLimitBucket`, `src/lib/auth/rate-limit.ts` | Keep |
| Dev tenant bypass | Local-only org impersonation. Production startup fails if it is on | `src/lib/auth/config.ts` | Keep. Not a product feature |
| PDF via print | Print stylesheet, not a generated file | `src/components/ExportPdfButton.tsx` | Irrelevant to the DOCX requirement. Do not treat it as document generation |
| Ad-hoc validators and persona fixtures | Scripts and JSON fixtures about a sales-forecasting product | `scripts/ad-hoc/`, `src/lib/persona-research/fixtures/` | Irrelevant to seekers. They lock tests to a sales subject. See section 6 |

Billing catalog copy says sending works through "Outlook Desktop, Microsoft 365, and Google Workspace" (`src/lib/billing/billing-catalog.ts`). The schema enum `MailboxProvider` has only `MICROSOFT_365`. Google send is not implemented. That is a product bug relative to the catalog, independent of the fork.

## 3. Vision-to-code map

Journey step numbers follow `docs/product-vision.md`: 1 Profile, 2 Target Employers, 3 Application, 4 Consultation, 5 Assets, 6 Interviews. The vision's Decisions log is binding. Where a decision and the code disagree, the disagreement is stated here and repeated in section 8. It is not silently resolved.

### Profile (journey step 1)

**Exists.** Product create and edit: `src/app/(app)/products/new/page.tsx`, `src/app/(app)/setup/[productId]/`. Sources: `ProductSource` with `URL`, `PASTED_TEXT`, `UPLOADED_DOCUMENT`, `USER_NOTE`. Upload accept list includes pdf and docx in `src/components/AddProductMaterialPanel.tsx` and `src/components/AssistedProductSetup.tsx`. Extraction: `src/lib/product-research/extract.ts`. URL fetch and synthesis: `src/lib/product-research/acquire.ts`, `src/lib/product-research/synthesize.ts`, `src/lib/product-research/prompt.ts`. Human review before approval: `src/components/ProductDraftReview.tsx`. Approved profile stored on `Product.profileJson` and `Product.messagingJson`. Field-level edit protection: `Product.manuallyEditedFields`.

**Classification: ADAPT.**

What changes: the synthesized object is a candidate (experience, skills, employers, dates, metrics), not a product. Decided: synthesis does not return `suggestedBuyerRoles` (`src/lib/product-research/prompt.ts`), and the setup rail does not prompt for a persona after the profile. Today the persona prompt comes from the readiness blocker "Needs at least one saved persona" in `src/lib/workflow/product-campaign-readiness.ts`, which `formatProductSetupClause` in `src/lib/workflow/home-setup-line.ts` renders as "needs a persona". The same readiness check gates campaign creation, so the change is a readiness rule, not only copy. Intake mechanics (upload, paste, note, URL, review, approve, do not silently overwrite edits) stay. `Product.valueProposition`, `averageOrderValue`, and `messagingJson` are the wrong fields for a person; either they stay unused or the new shape is stored in `profileJson` without renaming columns.

### Target Employers (journey step 2)

**Exists as ICP.** `Icp` belongs to a product (`Icp.productId` is required). Criteria are free-form `IcpCriterion` rows (`criterionType`, `operator`, `importance`, `isRequired`, `isDisqualifier`, `researchGuidance`). Interpretation of the natural-language definition: `src/lib/interpretation/icp.ts` (`ICP_INTERPRETATION_PROMPT_VERSION` 5). Setup pages: `src/app/(app)/setup/[productId]/icps/`. Qualification: `resolveIcpQualification` and `icpQualificationToBucket` in `src/lib/scoring/icp-qualification.ts` produce `GOOD`, `MAYBE`, `WEAK`, or `NO` with primary and secondary tiers and mandatory failures.

**Classification: ADAPT.** Confirmed by the Decisions log.

What changes: ICP prompt content is rewritten for employers (culture, stage, size, industry, geography, work arrangement). Culture, stage, and work arrangement have no dedicated `Icp` columns, but they fit as `IcpCriterion` rows, so no schema change is needed for them. `Campaign.icpId` stays required. Because `Icp.productId` is required, a Target Employer profile belongs to the seeker's Profile. The application form must auto-select the ICP when the Profile has exactly one.

Two gaps between the decision and the code:

- **Scoring an application.** The existing ICP scoring only runs inside a `ScoringRun`, which requires `contactListId`, and it writes results to `ContactScore` rows keyed by contact (`src/lib/scoring/engine.ts`, `scoreSingleContact` in `src/lib/scoring/score-contact.ts`). An application has one company, no list, and possibly no contact yet. The pure qualification functions are reusable. The run and storage are not. Creating a hidden list per application to satisfy the FK would be a stub. An application-level entry point that evaluates the company's `CompanyResearch` against the ICP criteria, and somewhere to store the result, are NEW.
- **Mismatch never blocks.** In list scoring, a failed `isRequired` or `isDisqualifier` criterion excludes the contact. For applications, the same outcome must be displayed as a signal with a seeker override, and nothing downstream may gate on it.

### Job paste, job requirement, company research (journey step 3)

**Exists for company research only.** `src/lib/research/prompt.ts` asks what the company sells, who it sells to, buying signals, and AOV. Results land on `CompanyResearch` (`whatTheySell`, `customerTypes`, `buyingSignals`, `riskSignals`, `estimatedAov`, and the rest). The worker and freshness are in section 2. Company identity ambiguity is `CompanyResearch.identityAmbiguous`.

**No job-posting parser exists.** No table holds a posting or a structured job requirement. Paste today creates a `ProductSource` or a contact list, not a job.

**Classification: NEW parser. ADAPT company research. ADAPT `Campaign` as the application.**

The application is a `Campaign` with its required `productId` (the Profile) and `icpId` (the selected Target Employer profile). Created from `src/app/actions/` the way `src/lib/campaign/save.ts` creates campaigns. The parsed job requirement should not be a `ProductSource`; it needs a new model or JSON on a new child of `Campaign`. Company research stays on `CompanyResearch`; the prompt content is in `src/lib/prompt-content/company-research.ts` (version 3). `riskSignals` holds employer risk. Hiring and growth are stored on `hiringSignals`, not in `buyingSignals`.

### Hiring-team personas (journey step 3 and the personas section)

**Exists, at the wrong scope.** `Persona.productId` is required. Personas are built from the approved product (`src/lib/persona-research/prompt.ts` takes `productEvidence` and a `selectedBuyerRole`). `CampaignPersona` attaches existing personas to a campaign. Peer overlap is detected by token Jaccard in `src/lib/persona/persona-differentiation.ts`. The custom form is `src/components/PersonaForm.tsx` and `src/components/BuildPersonaForm.tsx` (name, likely titles, department, why this role matters, notes).

**There is no account-level template library.** Every persona row belongs to one product.

**Classification: ADAPT the builder and the differentiation check. NEW for the template library and per-application instances.**

Decided: personas are created per application, not during profile build. Evidence becomes the job requirement plus `CompanyResearch`, not `ProductEvidenceBundle`. Instances need to be born on the application. `Persona.campaignId` scopes a role to one application; null keeps older product-level rows. `Persona.productId` stays required. Templates are `PersonaTemplate` rows per organization (question 13, resolved).

Differentiation: the Jaccard helper stays. The prompt rule that already says "articulate what distinguishes this role" (`src/lib/persona-research/prompt.ts`, rule 14) is the hook; its examples are buyer roles and quota-carrying reps and must be rewritten.

### Contacts roster (journey step 3)

**Exists as a list-driven flow.** `Contact` already has every decided field: `firstName`, `lastName`, `title`, `email` (nullable), and `linkedinUrl`. `CampaignContact` joins a contact to a campaign and stores `chosenPersonaId`. Persona resolution is `resolveContactPersonaDecision` in `src/lib/campaign/contact-persona.ts`, which picks among override, chosen, matched, draft, and suggested persona ids and reports `needsConfirmation`. Title fit is `evaluatePersonaTitleGate` in `src/lib/scoring/title-fit.ts`. Contacts enter campaigns today through lists and scoring.

**Classification: ADAPT.**

Decided: contacts are added one at a time to the application's roster. Lists, bulk validation, bulk scoring, and list-to-persona matching are hidden, and their code stays. A single-contact add action that creates `Contact` plus `CampaignContact` is new code. Its persona suggestion should call title fit and `resolveContactPersonaDecision` directly. The `matchedPersonaId` input normally comes from a `ContactScore`, which requires a `ScoringRun` and a list, so the add path must supply the title-fit result in its place. The seeker's change is the existing override input. `Contact` has a unique key on `(organizationId, ownerUserId, normalizedEmail)` and `normalizedEmail` is null without an email, so contacts without email do not dedupe. Interviewers recorded at a stage are created through the same add action.

### Consultation (journey step 4)

**Exists per application.** `ConsultationSession` stores status, prompt version, and coach commentary. `ConsultationTurn` stores the ordered transcript, with seeker answers verbatim and `seekerAuthored`. `ConsultationAssessment` stores STRONG, PARTIAL, or NONE evidence against scorecard items and required and preferred requirements, linked to Personal Profile FACT ids. `ConsultationProposal` holds extracted facts and STAR stories until the seeker confirms them. Confirmed facts append to `Product.profileJson` with provenance pointing at the seeker turn. Confirmed STAR stories are `ProfileStory` rows linked to competencies. Prompt content is `src/lib/prompt-content/consultation.ts` (version 1). The consultant display name is `consultationConfig.displayName`.

**Classification: NEW, now in place.**

The seeker can skip the consultation, skip a question, pause and resume, or mark Done. It also ends when required, outcome, competency, and mission gaps are STRONG or skipped. Preferred gaps do not block. Skipping does not block later asset generation. Consultation answers are a trusted claim source in `src/lib/email-generation/claim-origin.ts`.

### Assets (journey step 5)

**Email exists.** Context assembly: `src/lib/email-generation/context.ts`, `prepare-email-generation.ts`. Fact selection: `semantic-fact-selector.ts`. Length: `EmailLength` and the structure block in `prompt.ts`. Voice: first `VoiceSample` inside that prompt. Output is subject and body on `EmailDraft`. Send is Graph or a manual assertion.

**Resume, cover letter, and LinkedIn message do not exist.** No asset-type enum. No DOCX writer (`mammoth` only reads). LinkedIn is not a channel. The email prompt forbids sign-off and requires a subject and an actionable close, which is wrong for a LinkedIn note and wrong for a resume.

**Classification: ADAPT email. NEW `ApplicationAsset` model, NEW asset types, NEW DOCX renderer.**

Decided: email stays on `EmailDraft` with its `CampaignContact` relation unchanged, and requires a contact with an email address. The compose and send UI must refuse contacts whose `email` is null. Resume, cover letter, and LinkedIn copy are rows in a new `ApplicationAsset` model: type, application (`Campaign`), optional persona, version, structured JSON content, and the guidance that produced it. No contact. DOCX is rendered from the JSON on demand and not stored. A DOCX writer library is a new dependency. All types share the email chain: context, fact selection, and claim guard. That chain is keyed by a contact today (`loadEmailGenerationContext` in `context.ts` takes a `campaignContactId`), so the shared entry point must accept an application and optional persona without a contact. That is ADAPT on the machinery, not a copy of it.

### Interviews (journey step 6)

**Does not exist.** No stage, interviewer, or interview-note model. Campaign stages in `src/lib/workflow/campaign-stages.ts` are setup, list, companies, contacts, emails, report. Follow-up email (`followUpGuidance` in `prompt.ts`) assumes a prior outbound email in a sequence, not a meeting that happened.

**Classification: NEW stages and notes. ADAPT cadence surfaces.**

Stages, interview dates, and notes attach to the application. Interviewers become roster contacts through the contacts add action. Decided: the interview clock is anchored to the stage's interview date. A thank-you is due about 24 hours after the interview. A status check-in is due N days after it if there is no response. N is not decided. The due item asks for notes. Content is generated on demand after notes exist, never by the scheduler. Home and the digest read only `CampaignContact.nextDueAt` today (`src/lib/cadence/dashboard.ts`, `src/lib/cadence/digest.ts`), so both need a second source of due items. How "no response" is detected for a check-in is not decided. Reply columns exist on `EmailDraft`, but an interview may have no email thread.

### Application outreach cadence

**Exists.** `computeNextDueAt` in `src/lib/cadence/engine.ts`, recomputed in `src/lib/cadence/recompute.ts`, writes `CampaignContact.nextDueAt`. Policy: `OrganizationCadencePolicy`, defaulted from `DEFAULT_CADENCE_POLICY` in `src/lib/cadence/defaults.ts` (9, 6, 15, then every 30 days, maximum 4 emails).

**Classification: ADAPT.**

Decided: the existing clock stays, anchored to the first send, with job-seeker default intervals. Code disagreement: `computeNextDueAt` adds the next gap to the latest sent email (`latestSentAt`), not the first. Anchoring to the first send is a behavior change in the engine. The decision may instead mean the clock starts at the first send, which the code already does. That needs confirming (open question 17). The job-seeker interval values are not decided (open question 18).

### Guidance and regeneration

**Exists for email. Classification: ADAPT.**

`Campaign.emailGuidance` is the campaign-level string (`src/lib/campaign/settings.ts`, max length `EMAIL_GUIDANCE_MAX_CHARS` in `src/lib/campaign/save.ts`). The per-draft box is labeled "What should change?" in `src/components/EmailSequenceWorkspace.tsx` and arrives as `regenerationInstructions` in the email payload. Priority is already specified: per-draft overrides campaign guidance, and neither overrides factual constraints (`SYSTEM_PROMPT` in `prompt.ts`). `ApplicationAsset` stores the guidance that produced each version, per the decision. Extending the pair to the new types is the work.

### Claim guards

**Exists. Classification: ADAPT.**

`src/lib/email-generation/claim-validation.ts` asks the model to flag unsupported inventions and to trust the rep's offer, guidance, and edit. `claim-origin.ts` separates model text from rep text. Deterministic checks use `claimsNotToMake` and `terminologyToAvoid` on the product messaging object. Violations are descriptions stored on `EmailDraft.claimConflictsJson`.

Decided: for every asset, a skill, title, employer, date, credential, metric, or achievement appears only when it traces to the profile or a consultation answer. Emphasis and ordering are allowed. Additions are not. Resume generation fails closed. Two gaps:

- **Fail closed.** The email generation service in `src/lib/email-generation/service.ts` runs `validateGeneratedEmailClaims`, stores the violations, and saves the draft anyway. The guard fails open today. Resume needs a path that refuses to save. The decision does not say whether cover letter, LinkedIn, and email also fail closed or keep flag-and-save.
- **Traceability.** There is no trace from a generated fact to a profile field or consultation answer. The model judges support against evidence text. Field-level tracing is new checking on top of the existing chain.

### Plan and account shape

**Exists with more than the decision needs.** Plans in `src/lib/billing/plans.ts`: `COMPED`, `STANDARD`, `TEAM`, `PREMIUM` (legacy, displayed as Team), and `ENTERPRISE`. Seats in `src/lib/org/seats.ts`. Contact Sales is `mailto:erik@salesforecaster.io` in three plan selectors. Entitlements are `activeResearchedCompanyLimit`, `dailyEmailSendWarningLimit`, `monthlyEmailSendLimit`, and `researchFreshnessDays`. The catalog is `PlatformSetting` `billing.catalog`, seeded from `defaultBillingCatalogSetting` in `src/lib/billing/billing-catalog.ts`.

**Classification: ADAPT (hide), plus NEW entitlements.**

Decided: Standard only, organization of one, one Stripe plan. Seats, invites, team roles, member management, Contact Sales, Premium, and Enterprise are hidden, not removed. Limits come from configuration and are counted per application or generated asset. No entitlement counts applications or assets today, so those are new fields in the catalog and in usage checks. `plans.ts` also carries numeric entitlement defaults in code (for example Standard's trial entitlements of 25 researched companies and 1,000 monthly emails), used alongside the catalog. The new limits should live only in the catalog so they are not hardcoded.

### Proposed concept mapping

| Vision row | Code today | Classification |
| --- | --- | --- |
| Product → Profile | `Product` and the setup flow | ADAPT content. Keep the table name |
| ICP → Target Employers (confirmed) | `Icp`, required on every `Campaign` | ADAPT content. Application-level scoring entry point is NEW |
| Persona → Hiring Team stakeholder | `Persona` | ADAPT meaning and scope |
| Campaign → Application | `Campaign` with required `productId` and `icpId` | ADAPT |
| Contacts → Contacts | `Contact` and `CampaignContact` | ADAPT the add path. Person record reused. List import hidden |
| Campaign email settings → Application guidance | `emailLength`, `emailGuidance` | ADAPT the label and apply beyond email |

### Genuinely new capabilities

| Vision item | Classification | Where it attaches |
| --- | --- | --- |
| Job posting parser | NEW | New model plus an action beside `src/lib/campaign/save.ts`. Text extraction can call the same paste path as product sources |
| Application-level employer fit | NEW entry point, ADAPT scoring | Reuses `resolveIcpQualification` without a `ScoringRun` or `ContactList`. Needs its own stored result on the application |
| Per-application personas and account templates | NEW scope, ADAPT builder | `Persona.campaignId` plus `PersonaTemplate` (question 13, resolved) |
| One-at-a-time contact add | NEW action, ADAPT persona resolution | Creates `Contact` and `CampaignContact`. Calls title fit and `resolveContactPersonaDecision` |
| Consultation agent | NEW | New transcript and answer rows. Writes to the profile. Answers are claim trace sources |
| `ApplicationAsset` and DOCX rendering | NEW model and renderer, ADAPT generation chain | Sibling of `src/lib/email-generation/`. DOCX rendered on demand from JSON. Email stays on `EmailDraft` |
| Attachments on send | NEW on the Graph path, NEW download step | `buildMicrosoftGraphSendMailPayload` in `src/lib/email-generation/email-body.ts` takes `to`, `subject`, `body`, and signature. No attachment part. `sendMicrosoftGraph` in `src/lib/mailbox/microsoft-graph.ts` calls it. Handoff links (`OUTLOOK_WEB`, `OUTLOOK_DESKTOP`, `GMAIL_WEB` in `email-body.ts`) cannot carry files, so those paths get a download step |
| Interview stages and interview clock | NEW | Stages, dates, notes under the application. A second due-item source for Home and the digest |
| Fail-closed resume guard | NEW behavior on the existing guard | Refuses to save a resume with an untraceable fact |

### Settled decisions checked against code

| Decision | What the code does |
| --- | --- |
| Separate repo, Render, Postgres, history kept | This repo, `render:pre-deploy`, Prisma Postgres, git history present. No second remote in this clone |
| Paste a job, no job boards | No job-board client exists. Also no job parser |
| Keep internal names | Schema still uses Product, ICP, Persona, Campaign. Matches the decision. `ApplicationAsset` is a new model, not a rename |
| Prompt machinery shared, content in its own layer | Not true today. Instructions and payload assembly are one function per file. See section 5 |
| No hardcoded vocabulary or branding | Not true. `docs/vocabulary-audit.md` |
| Production-ready, no stubs | Billing catalog advertises Google send that is not built. `Offer` is marked legacy but still linked. A hidden list per application to satisfy `ScoringRun` would be a stub |
| EULA is admin data, not code | Runtime yes (`EulaVersion`). First boot copies `INITIAL_EULA_CONTENT` from `src/lib/legal/eula-seed.ts` if no row exists |
| Plan limits by configuration | Partly. The catalog is a `PlatformSetting`, but `plans.ts` holds numeric defaults in code |

## 4. Data model

Every Prisma model in `prisma/schema.prisma`. Tenant scope means `organizationId` on the row. User scope means a user FK that is the owner, not just "who clicked."

**Identity and access.** `AuthUser`, `AuthSession`, `AuthAccount`, `AuthVerification` are Better Auth tables (no org id). `User` is the app user. `Organization` is the tenant (`status`, `accountType`). `OrganizationMembership` joins them with `MembershipRole`. `OrganizationInvitation` is org-scoped.

**Billing and usage.** `OrganizationBillingProfile` (Stripe customer, subscription, lock reason). `OrganizationReferralCode`, `OrganizationReferralReward`, `ReferralRedemption`. `CompanyResearchCredit`, `OrganizationCreditGrant`. `StripeWebhookEvent` is global idempotency, not tenant data. `OrganizationUsagePolicy`, `UserUsageOverride`, `UsageQuotaLedger`, `UsageEvent`, `UsageAlertLedger`. `ResearchPolicy` is org-level research limits. `AiModelRate`, `ProviderSpendReconciliation` are platform cost tables.

**Voice and mailbox.** `VoiceSample` and `EmailSignature` are per user and per org. `MailboxConnection` and `MailboxOAuthState` are per user.

**Profile side (upstream "product").** `Product` belongs to the org, not to a user. `Icp` belongs to a product. `Persona` belongs to a product. `IcpCriterion` and `PersonaCriterion` belong to those parents. `Offer` belongs to the org and is optional on a campaign. Sources and runs: `ProductSource`, `ProductSourceBlob`, `ProductEvidenceBundle`, `ProductSetupRun`, `PersonaSource`, `PersonaEvidenceBundle`, `PersonaSetupRun`.

**People and companies.** `ContactList` and `ContactListMembership`. `Contact` is org-scoped (email identity, title, company name, archive reason). `ContactMergeAudit`. `Company` is unique per org and domain. `CompanyResearch` is many rows per company (history), with `researchedByUserId` and `firstResearchedByUserId` for metering. `ContactResearch` is one current row per contact (`@@unique([organizationId, contactId])`).

**Scoring.** `ScoringRun` ties a list, product, ICP, and persona. `ContactScore` is the result, including matched persona. `TitleSuggestion`, `ProductTitleDismissal`. `QualificationBucketOverride` targets a company or a contact. `ResearchRun` is the worker queue for company research.

**Application side (upstream "campaign").** `Campaign` is org-scoped and **user-owned** (`ownerUserId`). It requires `productId` and `icpId`. `personaId` is optional. Visibility is personal or shared. `CampaignPersona` is the set of personas in play. `CampaignContact` joins a contact, holds cadence (`nextDueAt`, `sequenceStoppedAt`) and `chosenPersonaId`. `EmailDraft` hangs off `CampaignContact`, unique on sequence number. `EmailSendRecord` hangs off the draft. `EmailSuppression` is org-wide by email. `OrganizationCadencePolicy` and `DailyDigestSend` are org and user digest state.

**Admin.** `EulaVersion`, `UserEulaAcceptance`. `PlatformSetting` (catalog and prices). `TransactionalEmailTemplate` and baseline and `TransactionalEmailEvent`. `SupportTicket`, `SupportTicketNote`. `AdminAuditEvent`. `RateLimitBucket`.

**What the vision forces.**

- Profile stays a `Product` row if names stay. The JSON inside `profileJson` changes shape. Buyer-role suggestions on `ProductSetupRun` must not be produced for a profile.
- A job requirement is a new entity. It is not an `Icp` and not a `ProductSource`. It belongs to one application and points at one `Company`.
- Persona scope moves from "all campaigns for this product" to "this application, cloned from an account template." `CampaignPersona` can point at instances. The template library is a new entity because `Persona.productId` is required.
- Consultation facts are new, and they must be readable by the claim guard as trusted input. They also write back onto the profile, so they are not campaign-only.
- Resume, cover letter, and LinkedIn copy need storage the email draft table does not fit (section 3).
- Interview stage, stage note, and per-interviewer guide are new. They are user-owned with the application.
- `Campaign.icpId` is required. A job-seeker application that has no Target Employers record cannot insert a `Campaign` row. That is the sharpest schema conflict.
- Company research columns are sales-shaped (`whatTheySell`, `buyingSignals`, `estimatedAov`). Renaming them breaks the "keep identifiers" decision. Adding nullable columns is the merge-safe way to store hiring and growth. Overloading `buyingSignals` is possible and misleading.
- Contacts stay org-scoped, so the same person can appear on more than one application. That matches "contacts are real people." Persona match stays on `CampaignContact`, which is already application-scoped.
- `Product` is org-scoped, not user-scoped. Two seekers in one org would share profiles. Today campaigns are user-owned and products are not. If each seeker has their own profile inside a shared org, profile ownership is a new FK. If each seeker is their own org, no change.

## 5. Prompt inventory

How assembly works today. Each prompt file exports a `build*Messages` function that returns a system string and a user string. The user string is usually `JSON.stringify` of a payload that includes a `responseSchema`. The system string interpolates a `*_PROMPT_VERSION` constant. Callers record that version on the result row (`CompanyResearch.promptVersion`, `Email` usage metadata, `Icp.interpretationPromptVersion`, synthesis run fields). Roles and HTTP calls are separate: the prompt does not choose the model. Structured output names are in `src/lib/ai/structured-output-schemas.ts` (`emailClaimValidation`, `prospectReplyClassification`, `campaignOfferValidation`, `productSourceDiscovery`, and others). Those names are identifiers.

Content is not separated from machinery. The email system prompt is one template that contains length rules, JSON-only output, the sign-off ban, and the sales task ("cold outbound", "selling motion", offer, CTA). Fact-selection code in `semantic-fact-selector.ts` both scores candidates and tells the model "this product solves this persona's problem." A clean split is: leave payload assembly, schema, version recording, and the numeric length bounds in the current files; move the instruction paragraphs and examples to a product prompt module that the builder interpolates. The hard part is the email prompt, because "actionable close" is both a length/structure rule (machinery the vision says to share) and a sales close (content). Those sentences have to be pulled apart by hand, not by file move.

Class B files from the vocabulary audit, with the judgment for this vision. **Structural** means the task, examples, or schema assume a seller and a product. **Word-swap** means the job is already the right job and only nouns are sales-shaped.

| Prompt | File | Stage | Rewrite |
| --- | --- | --- | --- |
| Outbound email system prompt, version 18, plus the user payload and the length blocks | `src/lib/email-generation/prompt.ts` | Email generation | **Structural.** It writes a cold email that opens on a pain, introduces a product, and closes with an ask such as a meeting or an estimate |
| Follow-up addendum and `followUpGuidance` | `prompt.ts`, applied in `src/lib/email-generation/prepare-email-generation.ts` | Email sequence | **Structural.** Later steps rotate product features and offers. Interview thank-yous are a different task |
| Reply strategy and reply wrapper | `replyStrategy` in `prompt.ts`; `buildReplyEmailPrompt` in `prepare-email-generation.ts` | Reply drafting | **Structural.** Categories are interested, objection, referral, not now, not interested, and the model is told to stop selling |
| Personalization tiers | `src/lib/email-generation/personalization.ts` | Email generation | **Structural.** Tiers tell the model to infer how the company sells and connect that to the product |
| Company-research use in email | `src/lib/email-generation/company-research-use.ts` | Fact selection and email | **Structural.** Selects deal complexity, cycle length, and buying centers |
| Required motion specifics | `src/lib/email-generation/motion-specifics.ts` | Fact selection | **Structural.** A fact is chosen because the persona has a problem the product solves |
| Fact selector | `src/lib/email-generation/semantic-fact-selector.ts` | Fact selection | **Structural.** Same intersection: persona pain, product, prospect |
| Claim guard | `src/lib/email-generation/claim-validation.ts` | Claim guard | **Structural.** The trusted and forbidden objects are product claims and prospect facts. The check itself (flag model inventions, trust supplied text) stays |
| Regeneration retry | `src/lib/email-generation/service.ts` | Email generation | **Structural.** The retry still says not to open with product capabilities |
| Prospect reply classifier | `src/lib/email-generation/reply.ts` | Reply drafting | **Structural.** The label set is a sales inbox |
| Offer validation | `src/lib/campaign/offer-validation.ts` | Campaign offer | **Structural**, and likely unused if offers are dropped. It checks an offer against product evidence |
| Product setup synthesis, version 5 | `src/lib/product-research/prompt.ts` | Profile research | **Structural.** It builds a thing being sold and suggests buyer roles. Profile build must not emit personas |
| Persona synthesis, version 8 | `src/lib/persona-research/prompt.ts` | Hiring-team research | **Structural.** It defines a GTM buyer. The output fields (titles, pains, outcomes, negative signals, peer distinction) can stay; the meaning of the role cannot |
| Persona interpretation, version 2 | `src/lib/interpretation/persona-prompt.ts` | Criteria from the form | **Structural.** Pains "make a solution relevant." Outcomes are what a buyer wants from adopting a solution, and the prompt spends its length separating that from a campaign CTA |
| ICP interpretation, version 5 | `src/lib/interpretation/icp.ts` | Criteria from the ICP form | **Structural.** Primary tier is firmographics that define the customer. Example criterion: "sells complex multi-stakeholder deals." Drop or rewrite only if Target Employers remains a feature |
| Company research, version 2 | `src/lib/research/prompt.ts` | Company research | **Structural.** Asks what they sell, who they sell to, and deal size. Employer research is a different question list on the same JSON schema |
| Product source discovery | `src/lib/research/web-search-retriever.ts` | Profile or company source finding | **Structural** for a product site (pricing, case studies). For a person, sources are résumé, portfolio, and public work. For an employer, sources are jobs, news, and team pages |
| Contact role research, version 1 | `src/lib/contact-research/service.ts` | Contact research | **Word-swap plus a criteria change.** "What is this person responsible for" is already the right task. It is aimed at buyer-persona criteria |
| Prospect scoring, version 5 | `src/lib/scoring/prompt.ts` | Scoring | **Structural**, and the journey does not use prospect scoring. Do not rewrite it until scoring is either removed from the seeker UI or retargeted at candidate-to-job fit |
| Title suggestion, version 1 | `src/lib/scoring/title-suggestion-prompt.ts` | Scoring | **Structural.** Maps titles onto buyer personas. Same hold as scoring |

UI strings that are fed into the email prompt: `src/components/EmailGuidancePromptExamples.tsx` ("ask for a reply instead of a meeting", "leave out pricing"). Those are class A copy and become model input when the seeker uses them as guidance. Rewrite with the email prompt.

There is no separate voice prompt. Voice is the sample pasted into the email system prompt. There is no production few-shot library. Sales emails in tests and in `src/lib/persona-research/fixtures/` are fixtures, not prompts.

## 6. Vocabulary decisions

Every class H hit in `docs/vocabulary-audit.md` is in exactly one category below. The audit has **1,500** H rows. Counts were taken from that file. Examples are `file:line`.

These rows were class H because the audit could not prove a job seeker, a model, or an email sees the string. Many are code. The decision is still required before someone "fixes" them, because fixing an internal name violates the merge rule.

| # | Category | Decision | Hits | Files | Examples | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Sample-product fixtures and ad-hoc scripts | Keep this sales-forecasting subject as test data, or replace it with a candidate profile. Do not word-swap "deal" inside a fixture whose product is a forecasting tool | 459 | 10 | `scripts/ad-hoc/list-product-personas.ts:17`, `scripts/ad-hoc/measure-deterministic-scoring.ts:203`, plus the JSON under `src/lib/persona-research/fixtures/` | Prompt tests will keep asserting sales output until the fixtures change |
| 2 | Unconfirmed library strings | For each string, confirm it is internal, then leave it. Do not route these through the vocabulary module | 242 | 36 | `src/lib/ai/config.ts:34` (AI role `"product"`), `src/lib/ai/config.ts:130` (`PRODUCT_AI_PROVIDER`), `src/lib/criteria/targeted-search-eval.ts:29` (`scope: "ICP"`) | A blanket replace will rename env vars and role keys |
| 3 | Product save and setup messages | Decide which of these errors and field names are shown in the UI. Shown ones become vocabulary. `valueProposition` as a form field name stays | 172 | 14 | `src/lib/product/save.ts:57` ("Product name is required."), `src/lib/product/save.ts:35` (`valueProposition`), `src/lib/product/save.ts:86` | Profile setup copy cannot be finished while these are unclassified |
| 4 | Route paths | Keep `/products`, `/campaigns`, `/personas`, `/icps`. Change labels only | 105 | 40 | `src/app/(app)/campaigns/new/page.tsx:41`, `src/app/(app)/campaigns/new/page.tsx:72`, `src/app/(app)/campaigns/page.tsx:28` | Renaming paths breaks bookmarks and upstream merges |
| 5 | Persona title filters and messages | `src/lib/persona/decompose.ts` treats "sales leader" and "decision maker" as generic titles to reject. Decide the generic-title list for hiring roles. Other strings in this set need the same shown-or-internal check as category 3 | 99 | 13 | `src/lib/persona/decompose.ts:68`, `src/lib/persona/decompose.ts:77` | The hiring-team builder will drop or keep the wrong titles |
| 6 | Scoring dimension labels | Scoring components are the strings `"product"`, `"icp"`, `"persona"`. Keep if scoring stays internal. Rewrite only the visible bucket labels if scoring is shown to seekers | 83 | 11 | `src/lib/scoring/calculate.ts:122`, `src/lib/scoring/calculate.ts:126` | Hiding vs adapting scoring (section 2) is blocked on this |
| 7 | Email claim-origin and rep wording | `REP_ASSERTED` is an internal origin tag. Decide whether "rep" appears in any seeker-visible claim explanation | 75 | 4 | `src/lib/email-generation/claim-origin.ts:9`, `src/lib/email-generation/claim-origin.ts:66` | Claim-guard copy will call the seeker a rep if these strings leak |
| 8 | Prisma schema and migration text | Keep. These are relation names and comments, not labels | 72 | 15 | `prisma/schema.prisma:644`, `prisma/schema.prisma:654`, `prisma/schema.prisma:655` | A schema rename breaks the merge rule |
| 9 | Auth account, dialog Close, Stripe Product id | Keep "Account Settings", dialog Close, and Stripe Product/Price wording. They are not sales accounts, sales closes, or the candidate profile | 47 | 27 | `src/app/(app)/settings/account/page.tsx:33`, `src/app/(app)/no-workspace/page.tsx:25`, `src/app/platform/billing/page.tsx` (Price/Product IDs) | Vocabulary work will "fix" account settings and the Stripe screen |
| 10 | Campaign persona-match messages | These sentences are shown when a title matches zero or many personas ("choose which applies"). Adapt the wording when personas are the hiring team. The match codes (`MULTI_PERSONA_MATCH`) stay | 45 | 9 | `src/lib/campaign/contact-persona.ts:31`, `src/lib/campaign/contact-persona.ts:32`, `src/lib/campaign/contact-persona.ts:34` | Contact-to-stakeholder matching UI |
| 11 | Operator scripts | Console text for coupons, bootstrap, and safety checks. Keep identifiers. Change only sentences an operator might copy to a customer | 33 | 7 | `scripts/create-referral-coupons.ts:40`, `scripts/create-referral-coupons.ts:58` | Easy to "clean up" a script and break a runbook |
| 12 | Research trigger heuristics | `src/lib/contact-research/trigger.ts` uses the substring `sales` as a title signal, and persona criteria decide whether title alone is enough. Decide the new trigger words for hiring roles | 33 | 7 | `src/lib/contact-research/trigger.ts:64`, `src/lib/contact-research/trigger.ts:155`, `src/lib/contact-research/trigger.ts:182` | Contact research will not run, or will run for the wrong people |
| 13 | Env samples and readme | `STRIPE_PRODUCT_*` and `PRODUCT_AI_*` stay. Readme title "Email Platform" is a brand decision (section 7), separate from env key names | 22 | 2 | `.env.example:57`, `.env.example:189`, `README.md` title | Renaming env vars breaks every deploy |
| 14 | Interpretation not-found errors | "ICP not found" and "Persona criterion not found" are thrown to the UI. Adapt the sentence when the user-facing name changes. Do not rename the action | 10 | 2 | `src/lib/interpretation/icp.ts:378`, `src/lib/interpretation/icp.ts:543`, `src/lib/interpretation/persona.ts:129` | Setup error text |
| 15 | Seat and quota error class names | `UsageQuotaError` and the individual-account seat sentence. Keep the class name. Adapt the seat sentence only if teams remain | 3 | 2 | `src/lib/org/seats.ts:42`, `src/lib/usage/quota-service.ts:16`, `src/lib/usage/quota-service.ts:23` | Billing errors and the team decision |

459+242+172+105+99+83+75+72+47+45+33+33+22+10+3 = 1,500.

## 7. Branding inventory

Class D from the vocabulary audit, EULA body excluded. The EULA seed is still the source of the SalesForecaster sentences; it is omitted here because the vision says the EULA is data. The contact address on the EULA is not repeated below except where the same address is hardcoded outside the EULA.

This clone cannot be diffed against a separate Aimed Outreach repo. "Wrong in upstream" means: the string does not match the parent name the vision uses (Aimed Outreach), and it was introduced in this same git history, so it is already not that name in the tree that would be upstream if this history is the upstream history.

| Item | Where | How it is set | Wrong relative to the Aimed Outreach name |
| --- | --- | --- | --- |
| Sidebar word "Outbound" | `src/components/Sidebar.tsx:26` | HARDCODED | Yes. Not "Aimed Outreach" |
| Sidebar "Email Platform" | `src/components/Sidebar.tsx:29` | HARDCODED | Yes |
| Auth layout "Email Platform" | `src/app/(auth)/layout.tsx:12` | HARDCODED | Yes |
| Document title "Email Platform" | `src/app/layout.tsx:16` | HARDCODED | Yes |
| Meta description "Multi-tenant outbound email platform" | `src/app/layout.tsx:17` | HARDCODED | Yes |
| Default From name "Email Platform" | `src/lib/transactional-email/config-core.ts:124`, used when `TRANSACTIONAL_EMAIL_FROM_NAME` is empty | HARDCODED default. Env overrides it | Yes, when the env var is unset |
| User-Agent `EmailPlatformProductResearch/1.0` | `src/lib/product-research/fetch-url.ts:67` | HARDCODED | Yes. Sent to third-party sites |
| User-Agent `EmailPlatformCompanyResearch/1.0` | `src/lib/research/sources.ts:214` | HARDCODED | Yes |
| User-Agent `EmailPlatformSafeFetch/1.0` | `src/lib/research/url-safety.ts:133` | HARDCODED | Yes |
| "Aimed Outreach" and `aimedoutreach.com` | `src/lib/billing/referral-share-message.ts:6` and `:8` | HARDCODED | No. This is the parent brand. It is wrong for AimedJobSeek only |
| "set by Sales Forecaster" | `src/app/(app)/settings/organization/page.tsx:313` | HARDCODED | Yes. A third brand, not Aimed Outreach |
| "Seat cap set by Sales Forecaster for your org" | `src/lib/billing/billing-catalog.ts:360` inside `defaultBillingCatalogSetting` | SEEDED. Copied into `PlatformSetting` key `billing.catalog` when missing. Editable at `src/app/platform/catalog/page.tsx` | Yes, as a default. An admin can change the stored catalog later; new orgs still receive this default from code |
| `mailto:erik@salesforecaster.io` | `src/components/billing/PlanSelector.tsx:9`, `SignupPlanSelector.tsx:17`, `OnboardingPlanSelector.tsx:23` | HARDCODED | Yes. Not a configured support address |

`SUPPORT_EMAIL` and `TRANSACTIONAL_EMAIL_FROM_EMAIL` are env-based (`src/lib/transactional-email/config-core.ts`). They are not class D hits. The From address default `noreply@localhost` is a hardcoded fallback and is wrong for any production brand, including upstream.

Database name `email_platform` and package name `email-platform` were classified internal, not D. They are not user-facing. Renaming them is not required by the vocabulary rule.

## 8. Recommendations and challenges

The vision's Decisions log settles Target Employers, lists, contacts, email, `ApplicationAsset`, attachments, profile build, cadence, plan shape, and the claim rule. Recommendations those decisions superseded have been removed. What remains is where the code resists a decision, and design advice the decisions do not cover.

**"Reuse the existing ICP scoring" needs a new entry point.** ICP scoring runs inside a `ScoringRun`, which requires `contactListId`, and stores results per contact on `ContactScore`. An application has one company and may have no contact. Do not create a hidden list per application to satisfy the FK; that is a stub. Reuse the pure pieces (`resolveIcpQualification`, `icpQualificationToBucket`, and the criterion evaluation used by scoring) from a new application-level function over `CompanyResearch`, and store its result on the application. Also make sure a failed `isRequired` or `isDisqualifier` criterion renders as a signal with an override. In list scoring the same result excludes the contact.

**The cadence decision and the cadence code disagree on the anchor.** The decision says the outreach clock is anchored to the first send. `computeNextDueAt` in `src/lib/cadence/engine.ts` adds each gap to the latest sent email. If "anchored to the first send" means "starts at the first send," the code already does that and only the intervals change. If it means every due date is measured from the first send, the engine changes. Confirm before changing `DEFAULT_CADENCE_POLICY`.

**Home and the digest have one due-item source.** `src/lib/cadence/dashboard.ts` and `src/lib/cadence/digest.ts` read `CampaignContact.nextDueAt` only. The interview clock is anchored to a stage date and may have no contact email or thread. Add a second source and merge it in both places. Do not write interview due dates into `CampaignContact.nextDueAt`; `recomputeCampaignContactCadence` in `src/lib/cadence/recompute.ts` overwrites that column from sent-email state.

**The generation chain is keyed by a contact.** `loadEmailGenerationContext` takes a `campaignContactId`. `ApplicationAsset` has no contact by decision. Split the context loader so application, profile, company research, and optional persona load without a contact, and email adds the contact on top. Copying the chain for assets will drift from upstream.

**The claim guard fails open today.** Email generation stores `claimConflictsJson` and saves the draft. A resume must refuse to save on an untraceable fact. Build that as a mode of the shared guard, not a second guard. The guard also has no field-level trace; it asks the model whether text is supported by evidence. Traceability to a profile field or consultation answer is new checking. Resume tests must fail on a fabricated employer, date, and metric. Email tests today fail on a fabricated product claim. Consultation answers should enter through the trusted-source path in `claim-origin.ts`, with stable ids so a trace can point at them.

**Removing the persona prompt after profile is a readiness change.** "Needs at least one saved persona" in `src/lib/workflow/product-campaign-readiness.ts` gates campaign creation and drives the setup rail. Remove it for the seeker path without weakening the other blockers (approved product, ICP with criteria). Stop `suggestedBuyerRoles` in `src/lib/product-research/prompt.ts` in the same change.

**Per-application personas are scoped.** `Persona.campaignId` set means the role belongs to that application. Null keeps older product-level rows. Account templates are `PersonaTemplate`. Selectors list only the current application's roles (question 13, resolved).

**Attachments need a rendered file at send time.** DOCX is not stored, so Graph send must render from `ApplicationAsset` content when the seeker attaches it and add a `fileAttachment` to the payload built by `buildMicrosoftGraphSendMailPayload`. Graph's inline attachment size limit applies; larger files need an upload session. The download step for handoff paths should reuse the same renderer.

**Plan limits must not be added to `plans.ts`.** The decision says configuration. `plans.ts` already carries numeric defaults in code beside the `billing.catalog` setting. Put application and asset limits only in the catalog and have usage checks read them there.

**Google send is advertised and absent.** Catalog bullets in `defaultBillingCatalogSetting` say "Outlook Desktop, Microsoft 365, and Google Workspace sending". Google is a handoff path by decision, with no attachment. Fix the catalog copy (seeded admin data) to say so.

**Two-level guidance is already the right design.** Campaign `emailGuidance` plus per-draft "What should change?" with factual constraints winning (`prompt.ts` priority list). Apply that pair to every asset and store it on `ApplicationAsset` as decided. Do not invent a third guidance level.

**Persona differentiation already exists** (`src/lib/persona/persona-differentiation.ts` and persona prompt rule 14). Reuse it so recruiter, hiring manager, and executive do not collapse. Change the evidence, not the algorithm.

**Company research reuse has a column problem.** The worker, cache, freshness, ambiguity flag, and per-user credit attribution are worth keeping. The stored questions are not. Prefer new nullable JSON (for example hiring signals) over stuffing hiring news into `buyingSignals`. Renaming `buyingSignals` fights the merge rule. Writing hiring text into it will confuse the next upstream cherry-pick.

**Prompt content layer (established by the Profile slice).** Product-specific instructions, rules, and examples live in `src/lib/prompt-content/`. Payload assembly, version constants, model calls, and parsing stay in the shared generation modules (`src/lib/product-research/prompt.ts`, `contract.ts`, and the same pattern for later slices). Profile synthesis content is `src/lib/prompt-content/profile-synthesis.ts`, imported by the assembler. Later slices add a file beside it and import it from the existing assembler. Do not put sales or job-seeker instructions back into the assembler, and do not change other areas' prompts from a slice that is not theirs. Bump the version constant when content changes so stored `promptVersion` values stay meaningful.

**Prompt split for remaining areas.** Machinery and sales content still share template literals for email, company research, persona synthesis, and scoring, especially `EMAIL_GENERATION_PROMPT_VERSION` 18. ICP interpretation content now lives in `src/lib/prompt-content/icp-interpretation.ts` (version 7). Follow the Profile slice pattern for the remaining areas: extract content into `src/lib/prompt-content/`, leave version constants and payload keys where they are. Scoring prompts stay as-is until a later slice.

**Recommended build order.**

1. Vocabulary module and brand configuration, wired to nav, layout, transactional From name, referral text, and the billing catalog defaults. Hide lists, seats, invites, team roles, member management, Contact Sales, Premium, and Enterprise from the UI. No behavior change.
2. Split prompt content from payload assembly for email, company research, persona synthesis, ICP interpretation, and scoring. Keep sales behavior until the new content is ready, behind the version constants, so the split is reviewable.
3. Profile: retarget product synthesis at a person, drop `suggestedBuyerRoles`, and remove the persona blocker from the setup rail. Keep approval and `manuallyEditedFields`.
4. Target Employers: employer content for ICP interpretation and criteria. Auto-select when one exists.
5. Application on `Campaign` with required `icpId`, job-paste parser, company resolve, research prompt aimed at hiring and risk, and the application-level employer-fit score shown as a non-blocking signal.
6. Per-application personas (`Persona.campaignId`, `PersonaTemplate`) and the one-at-a-time contact add with title fit and `resolveContactPersonaDecision`.
7. Consultation transcript writing back to the profile, plumbed into claim-origin trusted text.
8. Contact-free generation context. Email on the new content, restricted to contacts with an email address. Then `ApplicationAsset` with LinkedIn copy, cover letter, and resume, DOCX rendering on demand, and the fail-closed resume guard.
9. Graph `fileAttachment` from the renderer, and the download step on handoff paths.
10. Interview stages, interviewers as roster contacts, and the interview clock merged into Home and the digest. Job-seeker cadence defaults once the anchor question is answered.
11. Application and asset entitlements in the billing catalog, with the single Standard plan in Stripe.

## 9. Open questions

1. **RESOLVED.** Target Employers is a real step. `Campaign.icpId` stays required. Every application is scored against a Target Employer profile with the existing ICP scoring; a mismatch is a visible, overridable signal, never a block. Multiple profiles are allowed and a single one is auto-selected. Setup order is Profile → Target Employers → Applications.
2. **OPEN.** One profile per organization, or one profile per user? `Product` has no `ownerUserId`. `Campaign` does. With an organization of one these are the same today. Still open: may one seeker keep more than one Profile?
3. **RESOLVED.** Standard plan only, organization of one. Seats, invites, team roles, member management, and shared campaigns stay in code and are hidden from the UI.
4. **RESOLVED.** Lists are not imported in the seeker UI. List import, bulk validation, bulk scoring, and list-to-persona matching are hidden. Contacts are added one at a time to an application's roster.
5. **RESOLVED.** Bulk prospect scoring is hidden. ICP scoring of each application is visible as a non-blocking signal.
6. **RESOLVED.** Limits are counted per application or generated asset, not per email, and are set by configuration. The values are question 22.
7. **RESOLVED.** Microsoft 365 through Graph is the only direct send path and the only one that attaches. Outlook desktop and Google Workspace are handoff paths with a download step. The catalog's Google sending copy still needs correcting (section 8).
8. **RESOLVED.** The digest survives with two clocks, both on Home and in the digest: application outreach on the existing sequence clock with job-seeker intervals, and interview stages anchored to the interview date (thank-you about 24 hours after, check-in N days after with no response). Due items ask for notes. Content is generated on demand after notes, never on a timer. The anchor wording is question 17.
9. **RESOLVED.** Every asset may state a skill, title, employer, date, credential, metric, or achievement only when it traces to the profile or a consultation answer. Assets may emphasize and order facts but never add them. Resume generation fails closed. Whether other asset types fail closed is question 20.
10. **RESOLVED.** The seeker may skip the consultation, skip any question, pause and resume, or click Done. The consultation also ends when required, outcome, competency, and mission gaps are STRONG or skipped. Preferred gaps do not block the end. Materials can still be generated from the Personal Profile when consultation is skipped.
11. **OPEN.** Who supplies the DOCX styles for resume and cover letter? Nothing in the repo is a template. Rendering on demand is decided; the layout is not.
12. **OPEN.** LinkedIn is paste-only in the vision. Confirm there will be no LinkedIn API.
13. **RESOLVED.** Account-level templates are `PersonaTemplate` rows the seeker saves. Product configuration does not create a default set, and unedited defaults are removed. Templates never auto-populate an application; the seeker adds one. A per-application role is a `Persona` with `campaignId` set, identified from the job requirement and company research. `productId` stays required and points at the Personal Profile. Selectors show only that application's roles.
14. **RESOLVED.** Hiring and growth are stored on `CompanyResearch.hiringSignals`. They are not written into `buyingSignals`. `estimatedAov` is left null for job-seeker research.
15. **OPEN.** The referral sentence is the only user-facing "Aimed Outreach" left. Is the referral program itself staying?
16. **OPEN.** Hiding Contact Sales removes `erik@salesforecaster.io` from the three plan selectors, but the code stays. Which support address does AimedJobSeek use, and should the hidden code read it from `SUPPORT_EMAIL`?
17. **OPEN.** Outreach cadence anchor. The decision says anchored to the first send. `computeNextDueAt` measures each gap from the latest send. Does the decision mean the clock starts at the first send (no engine change), or that every due date is measured from the first send (engine change)?
18. **OPEN.** Job-seeker default intervals and maximum emails for the outreach clock. Current defaults are 9, 6, 15, then every 30 days, maximum 4.
19. **OPEN.** Interview check-in: the value of N, and what counts as "a response" when the interview has no email thread.
20. **OPEN.** Do cover letter, LinkedIn copy, and email fail closed like the resume, or keep today's flag-and-save?
21. **OPEN.** Where is the application-level employer-fit result stored, and is the seeker's override stored with it?
22. **OPEN.** Plan limit values for applications and generated assets, and whether both are limited or only one.

## Remaining sales-framed copy

Nouns now come from `src/lib/product-config/vocabulary.ts`. The sentences below still describe selling, a product being sold, or sales workflow. They were left in place except where a noun swap broke grammar. LLM prompts were not changed and are not listed here.

### Home (2) — done

- `src/app/(app)/page.tsx` — Track applications: apply through the employer portal, then write outreach when you find people on the Hiring Team
- `src/app/(app)/page.tsx` — Application creation unlocks after an approved Personal Profile with a Target Employer profile that has criteria. Voice samples are optional.

### Profile / product setup (16) — done

- `src/app/(app)/products/page.tsx` — `{Profile.ASingular} is built from your resume and other materials. Research it once, then define the {Target Employer profiles} that belong to it.`
- `src/components/AssistedProductSetup.tsx` — "Tell us about your background"
- `src/components/AssistedProductSetup.tsx` — hint: goals, target roles, constraints, or context
- `src/lib/product/save.ts` — `{Profile.Singular} name is required.`
- `src/lib/product-research/review.ts` — `{Profile.singular} name as you want it shown in {applications} and generated documents.`
- `src/lib/product-research/review.ts` — positioning is the candidate's value proposition
- `src/lib/product-research/review.ts` — functions are career functions, not buyer roles
- `src/lib/product-research/review.ts` — compensation is private; not sent to generation
- `src/lib/product-research/review.ts` — work arrangement and relocation, not sales motion
- `src/lib/product-research/review.ts` — education and credentials replace customer evidence
- `src/lib/product-research/review.ts` — field labels: identity, positioning, direction, experience, skills, gaps
- `src/lib/product-research/extract.ts` — "Paste resume or LinkedIn profile text into the paste field and try again."
- `src/lib/product-research/extraction-quality.ts` — unreadable URL asks for resume or LinkedIn text
- `src/lib/product-research/fetch-url.ts` — unreadable URL asks for resume or LinkedIn text
- `src/lib/product-config/vocabulary.ts` — Hiring Team title/department examples no longer use CRO, VP Sales, Sales
- `src/lib/product-research/review.ts` — "Personal site, portfolio, or GitHub URL"

### Target Employers / ICP (4) — done

- `src/app/(app)/icps/page.tsx` — `{Target Employer profile.ASingular} describes the kind of company you want to work for — natural-language criteria interpreted for scoring and {applications}.`
- `src/lib/icp/save.ts` — `{Target Employer profile} name is required.`
- `src/lib/icp/save.ts` — "Describe the kind of company you want to work for before saving. Interpretation uses this definition."
- `src/components/IcpDetailsForm.tsx` — "Positive Employer Signals"

### Hiring Team / personas (4) — done

- `src/components/PersonaBriefingDocument.tsx` — "{Hiring Team role}: {…}"
- `src/lib/scoring/config.ts` — "Positive Buying Signals" stays. It is a stored scoring dimension name, not a sentence shown as Hiring Team copy, and scoring prompts were not changed.
- `src/app/(app)/setup/[productId]/page.tsx` — "Career functions"
- `src/components/ProductDraftReview.tsx` — "Career functions"
- `src/lib/product-research/review.ts` — "Career functions" and "One career function per line."

### Applications / campaigns (8) — done

- `src/lib/campaign/save.ts` — "{Application} name is required."
- `src/lib/campaign/save.ts` — "{Profile} is required."
- `src/lib/campaign/save.ts` — "{Target Employer profile} is required."
- `src/components/NewCampaignForm.tsx` — posting paste and optional URL; the offer block is gone from new applications
- `src/components/NewCampaignForm.tsx` — "{Application} guidance" steers materials for this application
- `src/components/NewCampaignForm.tsx` — no "Free Forecast Audit" placeholder
- `src/lib/product-config/vocabulary.ts` — `offerCallToActionPlaceholder`: "Request a conversation"
- `src/lib/scoring/score-contact.ts` — "Meets the scored criteria."

### Contacts / lists (5) — done

- `src/app/(app)/companies/[companyId]/page.tsx` — Employer research for this application
- `src/components/CompanyResearchBriefing.tsx` — "What they make or do" / "Who they serve"
- `src/components/ListCompanyResearchView.tsx` — "What they make or do" / "Who they serve"
- `src/components/ManualCompanyResearchForm.tsx` — "Hiring and growth signals (one per line)"
- `src/lib/research/company-briefing.ts` — label "What they make or do"

### Email (3) — done

- `src/app/(app)/campaigns/[id]/page.tsx` — Application guidance for generated materials
- `src/components/CampaignEmailSettingsForm.tsx` — "Save application guidance"
- `src/app/actions/campaign-email-settings.ts` — "Unable to update application guidance. Please try again."

### Billing (5)

- `src/lib/billing/billing-catalog.ts` — Standard tagline "For individual salespeople"
- `src/lib/product-config/brand.ts` — lockup eyebrow `{Outbound}`; meta description "Multi-tenant outbound email platform"
- `src/lib/product-config/brand.ts` — referral share: "research {contacts} and write outbound emails — it saves me the half hour per {employer}…"
- `src/app/(auth)/login/page.tsx` — "Access your outbound workspace."
- `src/app/(app)/settings/billing/page.tsx` — "After 30 days we permanently delete that {contact} and outbound…"

### Emails and digest (1) — done

- `src/lib/transactional-email/templates.ts` — cadence digest: follow-up reminders on Home (alerts only; nothing is sent)

### Admin (4)

- `src/app/platform/email-templates/page.tsx` — "not customer outbound sales email."
- `src/components/platform/PurgeContactOutboundPanel.tsx` — "Delete {contact} and outbound data"; "Removes CRM and outbound rows"
- `src/app/platform/orgs/page.tsx` — "outbound data"
- `src/app/platform/orgs/new/page.tsx` — Enterprise / multi-user org copy (hidden from seeker plan UI; still on the operator console)

