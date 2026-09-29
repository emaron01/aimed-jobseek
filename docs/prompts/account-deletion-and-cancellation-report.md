# Account deletion and subscription cancellation — REPORT

**Repo:** `C:/Repos/aimed-jobseek` → `https://github.com/emaron01/aimed-jobseek.git`  
**Base:** `main` @ `14bc322` (`git rev-parse HEAD` at report time)  
**Mode:** REPORT ONLY — no application code, schema, tests, or data changed beyond saving this document and `docs/prompts/account-deletion-and-cancellation-report-prompt.md`.

## Direct answers

1. **When a seeker deletes their account, is everything removed?**  
   **Seekers cannot delete their account in-product today.** Settings (`src/app/(app)/settings/account/page.tsx`) only offer profile display, digest prefs, password change, and logout (**127–135**). The only hard workspace wipe is **Super Admin** `deleteOrganization`, which cascades nearly all org-owned DB rows, then purges orphaned `User` + Better Auth identity. Leftovers remain (audit metadata, support tickets with denormalized email/text, transactional email events, Stripe Customer, global platform tables). See §§1–6.

2. **When a customer cancels, what happens to account and data, and when?**  
   Local billing becomes `CANCELED` and the workspace is **payment-locked immediately** (writes blocked; most routes redirect to billing). **Data is not auto-deleted.** A **30-day** retention constant exists for a *selective* contact/outbound purge, but that purge is **manual Super Admin only** — **no cron/worker runs it**. Setup (Personal Profile / Product), voice, signature, billing, and credits are intentionally kept across that policy. See §8.

---

## 1. Every way an account can be deleted

### 1A. Seeker account settings — **not implemented**

- Page: `src/app/(app)/settings/account/page.tsx` (full file; logout form **127–135** → `logoutAction`).
- No delete-account Server Action or UI control exists for seekers (no matching handlers under `src/app/actions/` for account hard-delete).

### 1B. Super Admin organization hard-delete (only full wipe)

| Layer | Location |
|-------|----------|
| UI | `DeleteOrganizationPanel` — `src/components/platform/DeleteOrganizationPanel.tsx` **15–27** |
| Action | `deleteOrganizationAction` — `src/app/actions/platform-orgs.ts` **178–195** (`requirePlatformSuperAdmin`, confirm phrase, then `deleteOrganization`) |
| Service | `deleteOrganization` — `src/lib/platform/orgs.ts` **662–728** |

**Call chain inside `deleteOrganization`:**

1. Load org + Stripe ids (**666–676**).
2. `cancelStripeSubscriptionForOrgDelete` (**681–683**, impl **591–650**): cancel Stripe subscription when id present and `STRIPE_SECRET_KEY` configured; **refuse delete** if subscription id exists but Stripe is not configured (**607–610**); skip if no subscription id.
3. Collect member `userId`s (**685–689**).
4. Write `AdminAuditEvent` `PLATFORM_ORGANIZATION_DELETED` (**691–705**) — retained after org row is gone.
5. `prisma.organization.delete` (**707–709**) — Prisma cascades org-scoped relations (§2).
6. `purgeOrphanedTenantUsersAfterOrgDelete` — `src/lib/auth/purge-identity.ts` **33–66**: for each member, if `platformRole === "NONE"` (**52**) and no remaining memberships (**53**), `purgeAuthIdentity` (**20–26**) then `user.delete` (**62**). Platform operators are skipped.

**What each deletes**

| | Solo seeker org (typical INDIVIDUAL) | Multi-user org / user in multiple orgs |
|--|--------------------------------------|----------------------------------------|
| `Organization` + cascading tenant data | Deleted | Deleted (whole workspace) |
| That member’s `User` + Better Auth | Purged if they have zero memberships left | Purged only if they become orphaned; otherwise `User`/auth kept for other workspaces |
| Stripe subscription | Canceled when Stripe configured | Same |
| Stripe Customer | **Left in Stripe** on purpose (`orgs.ts` **655–657**) | Same |

### 1C. Not full account deletion

- **Selective contact/outbound purge:** `purgeOrganizationContactOutboundData` — `src/lib/platform/purge-contact-outbound.ts` **45–187** (action `purgeContactOutboundDataAction` in `platform-orgs.ts` **149–163**). Keeps org/users/setup/billing/credits (`purge-contact-outbound-shared.ts` **20–38**).
- **Convert to Comped:** `convertOrganizationToComped` — `orgs.ts` **998+** — cancels Stripe, does not delete the account.
- Test-only `prisma.user.delete` / `organization.delete` in Vitest files — not product.

---

## 2. Prisma models vs removal on Super Admin org delete

Unless noted, removal is **`Organization` `onDelete: Cascade`** via `organization.delete` only (no explicit multi-table delete list in `deleteOrganization`). Citations are `prisma/schema.prisma`.

### Cascaded with Organization (seeker/application data)

| Model / concern | Notes | Cascade cite |
|-----------------|-------|--------------|
| Personal Profile | `Product.profileJson` **1303** | Product → Org **1313** |
| Stories | `ProfileStory` | **2726–2727** |
| Applications | `Campaign` (+ `companyResearchNotes` **2397**) | **2372** |
| Job requirements | `JobRequirement` (incl. `seekerLearnedNotes` **2419**) | Org **2447**; also Campaign **2448** |
| Companies / research / runs | Org-scoped `Company` **1935+**, `CompanyResearch` **1960+**, `ResearchRun` | **1949**, **2011**, ResearchRun org Cascade |
| Hiring team / personas | `Persona` and related setup/source/evidence models | Org cascades on Organization relation list **584–632** |
| Contacts / lists / campaign contacts | `Contact`, `ContactList`, `CampaignContact`, … | Org cascades |
| Interview stages / guides | `InterviewStage*`, `InterviewStageGuide` | Org **2884**; Guide also stage **2885** |
| Harper | `ConsultationSession` / Turn / Assessment / Proposal / Statement | Session Org **2585** + Campaign **2586** |
| Cheat sheet | `ApplicationSummary` | Org cascade (Organization **592**) |
| Resume / cover / outreach | `ApplicationAsset.contentJson` **2772** (DOCX generated, not stored as files) | Org **2781** + Campaign **2782** |
| Application jobs | `ApplicationJob` | **2139** |
| Paid-call receipts | `PaidCallReceipt` | **674** |
| Usage events / quotas / policies | `UsageEvent` and related org ledgers | Org cascades |
| Voice / signature | `VoiceSample`, `EmailSignature` | Org **801/823** (+ User cascade) |
| Mailbox tokens | `MailboxConnection` encrypted tokens **840–841** | Org **850** |
| Billing profile / invites / memberships / credits / referrals | Org-owned billing graph | Cascades with Organization |
| Product research blobs | `ProductSourceBlob.bytes` **1593** | **1596** |

### Explicit after org delete (orphan users)

| Model | How |
|-------|-----|
| `AuthSession`, `AuthAccount`, `AuthVerification`, `AuthUser` | `purgeAuthIdentity` **20–26** |
| `User` | `user.delete` **62** when orphan + `platformRole === "NONE"` |
| `UserEulaAcceptance` | Cascade from User **3179** |

### Not removed (or only FK-null) by org delete

| Model | Behavior |
|-------|----------|
| `AdminAuditEvent` | Soft `organizationId` string **3140**; actor SetNull **3145** — **row kept** with metadata from delete (**orgs.ts** **691–704**) |
| `SupportTicket` | Org SetNull **3270**, submitter SetNull **3271**; **denormalized** email/name/subject/description **kept** (**3257–3264**) |
| `SupportTicketNote` | Lives with ticket; author SetNull **3288** |
| `TransactionalEmailEvent` | Org/User SetNull **3241–3242**; `recipientEmailNormalized` **kept** |
| `StripeWebhookEvent` | Global **1040–1048** — kept |
| `AiModelRate`, templates, `EulaVersion`, `PlatformSetting`, `RateLimitBucket`, `ProviderSpendReconciliation` | Platform/global — kept |
| Stripe Customer (external) | Intentionally not deleted |

### Restrict edges relevant to *User* purge (not org cascade)

These `onDelete: Restrict` FKs point at `User` and can block `user.delete` if rows still exist for that user on **other** surviving orgs: `Contact.ownerUserId` **1868**, `ContactList.ownerUserId` **1814**, `Campaign.ownerUserId` **2373**, `EmailSendRecord.sentByUserId` **3031**, `OrganizationCreditGrant.grantedByUserId` **1062**, `ProviderSpendReconciliation.createdByUserId` **718**, etc. For a solo org wipe, those rows are usually already cascade-removed with the org before orphan purge runs.

---

## 3. Shared data

| Item | Shared across orgs? | Seeker personal data after org delete? |
|------|---------------------|----------------------------------------|
| `Company` | **No** — always `organizationId` (**1937**, unique `[organizationId, normalizedDomain]` **1954**) | Removed with org |
| “Introducer” attribution | `CompanyResearch.firstResearchedByUserId` (**2004–2007**) is org-scoped; SetNull on user delete **2014** | Gone with org |
| Platform catalogs/rates/templates/EULA | Yes | No seeker profile payload |
| `AdminAuditEvent` | Platform | May retain org name / member ids in JSON metadata |
| `SupportTicket` | Soft-linked | **Yes** — email + free text survive |
| `TransactionalEmailEvent` | Soft-linked | **Yes** — normalized email |
| Stripe Customer | External | Billing identity remains in Stripe |

Nothing in schema is a global shared company directory that absorbs seeker-supplied company notes across tenants.

---

## 4. Outside the database

| Asset | On org hard-delete |
|-------|--------------------|
| Uploaded materials | In-DB `ProductSourceBlob` — cascade |
| Resume/cover DOCX downloads | Ephemeral render from DB — gone with assets |
| Better Auth sessions/accounts | Removed for purged orphans |
| Microsoft Graph tokens | DB rows cascade; **no revoke call** found in delete path — Microsoft-side grant may linger (**cannot confirm** remote cleanup) |
| Stripe subscription | Canceled when configured |
| Stripe Customer | **Not** removed |
| ESP / transactional provider | Local event rows kept; provider-side retention **cannot be determined** from this repo |
| Caches | No account-deletion cache purge found; worker memory is process-local |

---

## 5. In-flight work

**Application jobs:** Cascade-deleted with org. `processApplicationJob` returns soft failure if missing (`process.ts` **43–51**). `failApplicationJob` no-ops if job absent (**494–497**). Worker logs and continues (`scripts/research-worker.ts` **53–63**) — **does not retry forever** on a deleted id.

**Research runs:** Same cascade. Mid-run crash handler updates the run (**runs-service.ts** **1018–1036**); if the row was already deleted, that update fails and is logged — run is not reclaimed.

**Recreate after delete:** Old org/campaign/receipt ids are gone. New signup creates a **new** organization (`provisionIndividualWorkspace`, `provision-service.ts` **129–136**, **180–195**). Jobs cannot write into a deleted org.

---

## 6. Leftovers checklist (after org delete + successful orphan purge)

**Personal / personal-adjacent**

- Support ticket bodies + `submittedByEmail` / names  
- Transactional email event recipient emails  
- Admin audit metadata (org name, member user ids, Stripe ids)  
- Stripe Customer in Stripe  
- Possible lingering Microsoft OAuth consent (external)

**Non-personal**

- Platform rates, templates, EULA versions, settings, webhook idempotency rows, rate-limit buckets  

**Removed (not leftovers):** campaigns, Harper, assets, jobs, PaidCallReceipts, org companies/research, contacts, mailbox token rows, local billing profile, usage events for that org, Product/profileJson, voice samples for that org.

---

## 7. Same email after delete + signup

- **Successful orphan purge:** auth + `User` removed; email unique columns freed (`User.email` / `emailNormalized` **728–729**; intent stated in `purge-identity.ts` **1–2**). New signup is a **fresh** User + Organization — no automatic restore of old applications.
- **User not purged** (still a member elsewhere, or platform operator): existing `User` is reused (`provision-service.ts` **186–195**).
- **Cancel then resubscribe** (org still exists): same workspace data unlocks (§8e) — not the same as delete+signup.

---

## 8. Cancellation

### 8a. Cancel paths and Stripe reachability

`stripeConfigured()` = `Boolean(process.env.STRIPE_SECRET_KEY?.trim())` — `src/lib/billing/stripe.ts` **11–12**.

| Path | Chain | Without Stripe setup |
|------|-------|----------------------|
| Seeker cancel owned sub | `cancelOwnedOrgSubscriptionAction` (`workspace.ts` **110–160**) → `cancelStripeSubscriptionForOrgDelete` → `markSubscriptionCanceled` | Fails if subscription id exists and Stripe unset (**orgs.ts** **607–610**) |
| Stripe Customer Portal | Portal session APIs; Stripe mutates subscription; webhooks sync | Unreachable without Stripe |
| Webhook `customer.subscription.deleted` | `handle-stripe-webhook.ts` **90–104** → `markSubscriptionCanceled` | Needs webhooks |
| Webhook `customer.subscription.updated` | May set `cancelAtPeriodEnd` while still ACTIVE (`sync-subscription.ts` **260–284**) until period ends / delete event | Needs Stripe |
| Super Admin org delete | Cancel then hard-delete (§1B) | Blocked when sub id + no Stripe key |
| Super Admin → Comped | `convertOrganizationToComped` (**998+**) cancels live subs | Same gate when linked |
| Failed payment | `PAST_DUE` + 14-day grace (`payment-lock.ts` **54–58**, **126–128**) — not CANCELED until Stripe cancels/unpaid | Needs Stripe |
| Trial end | Stripe conversion / `endTrialNow` | Needs Stripe |

### 8b. Access when canceled

- `markSubscriptionCanceled` (`sync-subscription.ts` **351–386**): `billingStatus: "CANCELED"`, `lockReason: "CANCELED"`, clears grace.
- Immediate **route lock** (`isPaymentLocked` **120–121**) and **spend/write block** (`isSpendBlocked` **149+**).
- Still allowed: billing, EULA, support, billing APIs (`PAYMENT_LOCK_*` **31–46**).
- Seeker can view billing copy and start resubscribe Checkout when admin-capable; cannot use research/generation/send/setup writes.

### 8c. Retention definition

- **30 days** from `canceledAt`: `CONTACT_OUTBOUND_RETENTION_DAYS` / `_MS` — `purge-contact-outbound-shared.ts` **9–16**.
- UI copy: `settings/billing/page.tsx` **284–302** (keep contacts/campaigns/research/drafts/suppressions for 30 days; then delete that contact/outreach slice; keep account/setup/billing/credits).
- During retention: **all** DB data remains; access is locked only.

### 8d. Automatic removal after retention

- **None implemented.**  
- `listPurgeEligibleOrganizations` (**204–262**) only **surfaces** eligible orgs on platform UI.  
- Purge executes only via Super Admin `purgeOrganizationContactOutboundData` (**45–187**).  
- Only cron-style job found: `POST /api/jobs/cadence-digest` with `CRON_SECRET` (`cadence-digest/route.ts` **6–17**) — **digest email**, not retention purge. No `render.yaml` cron for purge in-repo. Whether `CRON_SECRET` / digest cron is configured on Render is **deployment config outside this commit** — not verifiable from application code alone.

**Selective purge vs full org delete (§2):** purge deletes contacts/lists/companies/research runs/scoring/campaigns/drafts/sends/suppressions (and **campaign-cascaded** Harper sessions, job requirements, application assets, interview stages, application jobs). It **keeps** Organization, Users, Products (Personal Profile), ICPs, personas, voice, signatures, billing, credits, referrals (`purge-contact-outbound-shared.ts` **32–37**). It does **not** delete `PaidCallReceipt` / org-wide `UsageEvent` by name (those remain unless cascade from deleted children implies otherwise — receipts are org-scoped only, **not** in the purge delete list, so **they remain**).

### 8e. Reactivation

- Resubscribe while org exists: Stripe Checkout → webhook sync to ACTIVE/TRIALING; `extendCompanyResearchCreditsAfterCancelLapse` on CANCELED→live (`sync-subscription.ts` **234–298**). Same org data unlocks (billing copy **294–295**; `ResubscribeCheckoutButton` mentions 30-day keep).
- After selective purge: setup/profile may remain; purged contact/campaign/Harper-via-campaign data is gone — rebuild required for that slice.
- After full org delete: must sign up fresh (§7) — no restore.

### 8f. Aimed Outreach inheritance / job-seeker fit

From this codebase (not the Outreach repo):

- Product vision states AimedJobSeek is a fork of Aimed Outreach (`docs/product-vision.md` **7–13**).
- Cancellation retention and purge vocabulary still speak in **contact / campaign / outreach / suppression** terms (`purge-contact-outbound-shared.ts` **25–30**; billing page **291–301**) — sales-outreach framing for a job-seeker product.
- Purge **keeps** “products, ICPs, personas” as setup — for seekers that maps to Personal Profile + hiring-team templates, but the **30-day policy does not mention** Harper Q&A or cheat sheets explicitly; those disappear when campaigns are purged via cascade, which may surprise a job-seeker retention story.
- Company-research **first introducer** / credit packs (`company-research-credits.ts` header comments; billing extend-on-resubscribe) are B2B research-pooling concepts carried into job-seeker research metering.
- No separate “Aimed Outreach” string in billing cancel code paths; inheritance is structural (org billing lock + contact outbound purge).

---

## TESTS a fix would add (not run or written here)

1. **Real-Postgres full wipe:** Seed org+user with Product/`profileJson`, ProfileStory, Campaign, JobRequirement, Company+CompanyResearch+ResearchRun, Personas, Contacts, InterviewStage(+Guide if present), ConsultationSession/turns/statements, ApplicationSummary, ApplicationAsset, ApplicationJob, PaidCallReceipt, UsageEvent, VoiceSample, MailboxConnection, billing profile. Call `deleteOrganization`. Assert **zero** rows with that `organizationId` across those models; assert orphaned seeker `User`/`AuthUser` gone; assert SupportTicket denormalized email may remain (document expected policy).
2. **Multi-org member:** User in org A+B; delete A; assert User/auth remain; B data intact; A cascades away.
3. **Stripe gate:** Org with `stripeSubscriptionId` and no `STRIPE_SECRET_KEY` → `deleteOrganization` throws; org still present.
4. **Worker after delete:** Create IN_PROGRESS `ApplicationJob`, delete org, `processApplicationJob(id)` returns not-found / no throw loop; claim does not resurrect work.
5. **Cancel lock:** `markSubscriptionCanceled` → `isPaymentLocked`/`isSpendBlocked` true; exempt billing path still open.
6. **Retention listing:** Org CANCELED with `canceledAt` 31 days ago and leftover contacts → appears in `listPurgeEligibleOrganizations`; at day 29 does not.
7. **Scheduled purge (if implemented):** Assert cron/worker deletes the selective set after retention and **keeps** Product/profile/voice/billing; assert **before** retention nothing is purged. (Today this job does not exist — test would gate the fix.)
8. **Resubscribe within window:** CANCELED→ACTIVE restores spend; data still present if purge not run.
9. **Signup after purge identity:** After orphan purge, signup with same email creates new org id; no FK to old campaigns.
10. **Selective purge vs Harper:** After `purgeOrganizationContactOutboundData`, assert campaigns/consultation sessions/assets gone; Product.profileJson and VoiceSample remain.

---

## Risks / unknowns

1. **No seeker self-delete** — GDPR-style “delete my account” cannot be completed without Super Admin.
2. **30-day purge is policy/UI only** — without a scheduled job, canceled orgs retain contact/Harper-via-campaign data indefinitely until a human purges or deletes the org.
3. **Support tickets and email events retain PII** after org/user FK nulling.
4. **Stripe Customer and possible Microsoft grants** outlive DB deletion.
5. **User purge Restrict failures** if the seeker is still referenced from surviving platform/other-org Restrict relations — not exercised by a single end-to-end production proof in this report.
6. **Render cron / `CRON_SECRET` actual deployment** for digest (and any future purge) cannot be confirmed from repo alone (no `render.yaml` purge schedule in-tree).
7. Whether Stripe is configured in the current Render environment is **ops/env**, not visible from `14bc322` source.

---

## Confirmation

- Aimed Outreach repository was not read or touched.  
- No application code, schema, configuration, tests, or data were modified for this task beyond the prompt + this report under `docs/prompts/`.  
- No destructive git commands were used.
