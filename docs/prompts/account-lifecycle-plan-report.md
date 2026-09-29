# Account lifecycle plan — full wipe, read-only, scheduled delete

**Repo:** `C:/Repos/aimed-jobseek` → `https://github.com/emaron01/aimed-jobseek.git`  
**Code base:** application behavior as on `main` @ `14bc322` (docs-only commit `e0ebb02` added the prior report; no product code changed since `14bc322`)  
**Prior report:** `docs/prompts/account-deletion-and-cancellation-report.md`  
**Mode:** PLAN ONLY — no code, schema, tests, or data changes in this task.

**PO decisions applied:** full shared wipe (decision 1); self-serve delete (2); service through paid period then 30-day read-only (3–4); auto-wipe after 30 days (5); Super Admin uses same wipe (6); replace selective contact/outbound purge (7).

---

## 1. Full wipe

### 1.1 Shared operation

Introduce one function, e.g. `wipeOrganizationAccount` in a new module such as `src/lib/account/wipe-organization.ts` (Node-safe / usable from Server Actions, platform actions, and cron).

Callers (same wipe body):

| Caller | Entry |
|--------|--------|
| Seeker self-serve | New `deleteMyAccountAction` (§4) |
| Super Admin | Replace body of `deleteOrganization` (`src/lib/platform/orgs.ts` **662–728**) / `deleteOrganizationAction` (`platform-orgs.ts` **178–195**) |
| Scheduled job | New cron route (§7) |

Keep Stripe cancel failsafe from `cancelStripeSubscriptionForOrgDelete` (`orgs.ts` **591–650**): cancel active subscription when `stripeSubscriptionId` is set and Stripe is configured; if id is set and Stripe is **not** configured, **refuse** wipe (same as today **607–610**) so the seeker is not left billable in Stripe while gone locally. Stripe **Customer** stays in Stripe (decision 1; today **655–657**).

Mailbox: delete `MailboxConnection` / `MailboxOAuthState` with org cascade only — **no** Graph revoke (decision 1; unused in product).

### 1.2 Order of operations (root cause: leftovers + Restrict)

Today `organization.delete` cascades most tenant rows but leaves SupportTicket / TransactionalEmailEvent / AdminAuditEvent PII (prior report §2–§6). Restrict on User FKs can block orphan `user.delete`.

**Proposed order:**

1. **Load** org id, member user ids, billing Stripe ids, owner emails (for email-event purge keys).  
2. **Cancel Stripe subscription** (`cancelStripeSubscriptionForOrgDelete`) when applicable.  
3. **Stop in-flight work** (§3): fail/cancel PENDING and IN_PROGRESS `ApplicationJob` and `ResearchRun` for this `organizationId`; do not start new paid work.  
4. **Explicit personal leftover delete** (before or in same transaction as org delete), scoped to this org/users/emails:  
   - `SupportTicketNote` for tickets matching org or submitter  
   - `SupportTicket` where `organizationId` **or** `submittedByUserId` in member ids **or** `submittedByEmail` in member emails (schema **3253–3271** — denormalized email must be deleted explicitly)  
   - `TransactionalEmailEvent` where `organizationId` **or** `userId` **or** `recipientEmailNormalized` in member emails (**3225–3242**)  
   - `AdminAuditEvent` where `organizationId` **or** `actorUserId` **or** `targetUserId` in scope (**3136–3150**) — see §2 for optional non-PII replacement record  
5. **`prisma.organization.delete`** — relies on existing `onDelete: Cascade` for org-owned models listed in prior report §2 (Product/`profileJson`, ProfileStory, Campaign, JobRequirement, Company/CompanyResearch/ResearchRun, Persona graph, Contact graph, Interview*, Consultation*, ApplicationSummary/Asset/Job, PaidCallReceipt, Usage*, VoiceSample, EmailSignature, Mailbox*, billing profile, credits, etc.).  
6. **Orphan user purge** (evolve `purgeOrphanedTenantUsersAfterOrgDelete`, `purge-identity.ts` **33–66**): for each former member with `platformRole === "NONE"` and zero remaining memberships:  
   - Delete any **remaining** rows that still Restrict-reference that User **and** belong only to wiped context (should already be gone with org).  
   - If Restrict rows remain on **other** orgs (`OrganizationCreditGrant.grantedByUserId` **1062**, `ProviderSpendReconciliation.createdByUserId` **718**, etc.): **do not** delete those other orgs; either (a) re-point/null those FKs only when the grant/recon is for the wiped org (already cascaded), or (b) for cross-org Restrict authored by this user on a **surviving** org, keep the User (membership elsewhere already implies keep). Solo seeker path: no surviving membership → `purgeAuthIdentity` (**20–26**) + `user.delete` (**62**).  
7. **Auth:** `AuthSession` / `AuthAccount` / `AuthVerification` / `AuthUser` via `purgeAuthIdentity`.

**User in multiple organizations:** wipe deletes **one** organization (the target workspace). Memberships on other orgs remain; User + auth remain (`purge-identity.ts` **53**). Self-serve (§4) targets the seeker’s **owned personal workspace** (OWNER of active org / INDIVIDUAL), not every org they can see.

### 1.3 Restrict relations pointing at User

| Relation | Schema | Handling in wipe |
|----------|--------|------------------|
| `Campaign.ownerUserId` | Restrict **2373** | Campaigns cascade with Organization **2372** before user delete |
| `Contact.ownerUserId` / `ContactList.ownerUserId` | Restrict **1868** / **1814** | Cascade with org |
| `EmailSendRecord.sentByUserId` | Restrict **3031** | Cascade with org |
| `EmailSuppression.suppressedById` | Restrict **3058** | Cascade with org |
| `QualificationBucketOverride.overriddenById` | Restrict **2329** | Cascade with org |
| `OrganizationCreditGrant.grantedByUserId` | Restrict **1062** | Grant rows for this org cascade with Organization **1061**; user delete safe if no grants on other orgs |
| `ProviderSpendReconciliation.createdByUserId` | Restrict **718** | Platform table; if seeker authored rows, keep User or null FK in a follow-up schema change (Seekers rarely create these — Super Admin). Plan: if wipe fails on Restrict, surface error; optional schema follow-up `onDelete: SetNull` for platform-only tables (**approval**) |

No need to change Campaign/Contact Restrict for the solo wipe path if org cascade runs first.

### 1.4 Atomicity / resumability

- Prefer a **single Prisma interactive transaction** with elevated timeout (pattern already used in `purgeOrganizationContactOutboundData` **57–172**, `timeout: 120_000`) covering steps 4–6 after Stripe cancel (Stripe is external and not transactional).  
- If transaction fails mid-way: org may still exist → safe to retry wipe idempotently (deleteMany by ids is safe; `organization.delete` fails only if already gone → treat as success).  
- If Stripe cancel succeeded and local wipe fails: subscription already canceled (desired); retry local wipe.  
- If org deleted but user purge failed: retry orphan purge alone (idempotent).  
- Cron (§7) retries failed orgs on next run.

### 1.5 External resources

| Resource | Action |
|----------|--------|
| Stripe subscription | Cancel when live |
| Stripe Customer | Keep |
| Microsoft mailbox | DB rows only |
| Generated DOCX | Not stored; gone with assets |
| ProductSourceBlob | Cascade with org |

---

## 2. Deletion record (options — PO chooses; plan does not)

Today `deleteOrganization` writes `AdminAuditEvent` with org name, member ids, Stripe ids (**orgs.ts** **691–704**), which survives and holds personal/operational identifiers (prior report §6).

**Options for PO:**

| Option | Behavior | Personal data after wipe? |
|--------|----------|---------------------------|
| **A. None** | No audit row for wipe | None in DB from wipe |
| **B. Opaque counter only** | Increment a `PlatformSetting` JSON counter / store `{ wipedAt, reason: "self_serve"|"admin"|"cron" }` with **no** org id, email, name, or Stripe ids | None |
| **C. Opaque id hash** | Store `sha256(organizationId)` + timestamp + reason only (not reversible to email) | No cleartext PII; theoretical link if someone still has the old id |
| **D. Stripe-side only** | Rely on Stripe Customer / canceled subscription history; nothing local | None local |

Implementation must delete existing-style wipe audits that contain names/emails/member ids (step 4), then apply the chosen option once.

---

## 3. In-flight work

**Before wipe (step 3):**

- `ApplicationJob`: `updateMany` for this org where status in `PENDING`/`IN_PROGRESS` → `FAILED` with a stable terminal error (or deleteMany — cascade will remove anyway). Prefer mark FAILED first so a racing worker hits a terminal row.  
- `ResearchRun`: same for in-progress/pending statuses used by the worker.  
- Do not enqueue new jobs from wipe.

**Worker already mostly safe** (prior report §5):

- `processApplicationJob` missing job → soft fail (`process.ts` **43–51**).  
- `failApplicationJob` no-ops if missing (**490–497**).  
- Research crash path updates by id; deleted row → log and continue.

**Hardening required:**

1. At start of `processApplicationJob` / `processResearchRun`: if org missing **or** org is read-only (§6), exit cleanly without calling AI or writing tenant data.  
2. Inside `runPaidStructuredCall` (`paid-call-gate.ts` **165+**): assert org exists and **not** read-only / not wiped (today this gate does **not** call `assertOrganizationNotPaymentLocked` — spend lock is only on callers). Add the shared read-only/spend check here so queued paths cannot bypass UI.  
3. After wipe, no `PaidCallReceipt` / org rows remain → no recreate. Claim loops (`claimNextApplicationJob`) only see remaining orgs’ jobs.

---

## 4. Self-serve delete

**Where:** `src/app/(app)/settings/account/page.tsx` (today logout only **127–135**) — new section “Delete my account” with confirmation.

**Auth:** Only the signed-in user who is **OWNER** of the active organization (same OWNER check pattern as `cancelOwnedOrgSubscriptionAction`, `workspace.ts` **96–98**). Members/admins who are not OWNER cannot wipe the workspace. Super Admin retains platform wipe (§1).

**Must work while read-only:** exempt delete action from read-only write block (§6), like billing pay paths.

**Flow:** confirm → `wipeOrganizationAccount` → invalidate session / `purgeAuthIdentity` as part of wipe → redirect to logged-out landing (e.g. `/login` or marketing). **Wording needed** from PO for: button label, confirmation phrase/modal body, success/error, and post-delete page copy — plan does not draft it.

**After:** account gone; signup with same email is fresh (§7 of prior report / TESTS below).

---

## 5. Billing states

### 5.1 Target states (product)

| State | Meaning |
|-------|---------|
| **Active** | Full access (`ACTIVE`, `TRIALING`, or durable `FREE`/COMPED) |
| **Cancelling at period end** | Still full access; `cancelAtPeriodEnd === true` (field already on `OrganizationBillingProfile` **937**) |
| **Read-only** | Paid period ended without payment; view-all; no creates/changes; no paid AI/jobs; 30-day wipe clock running |
| **Wiped** | Org/user gone |

### 5.2 Mapping from today’s enums

Today (`BillingStatus` **25–32**, lock helpers `payment-lock.ts`):

- Cancel → immediate `CANCELED` + route lock (`markSubscriptionCanceled` **351–386**; `isPaymentLocked` **120–121**).  
- `PAST_DUE` → spend blocked immediately; route lock after `PAYMENT_LOCK_GRACE_MS` 14 days (**54–58**, **126–128**).

**Replace with:**

| Event | Local result |
|-------|----------------|
| Seeker cancels (or Portal cancel-at-period-end) | Keep `ACTIVE`/`TRIALING`; set `cancelAtPeriodEnd: true`; **do not** enter read-only until period ends |
| `customer.subscription.updated` with `cancel_at_period_end` | Mirror `cancelAtPeriodEnd`; remain Active |
| Period ends / `customer.subscription.deleted` / terminal unpaid after paid period | Enter **Read-only**: set billing status (recommend keep `CANCELED` **or** add `READ_ONLY` — §10) + **`readOnlyStartedAt = now`** (new field) + clear route-lock-only behavior |
| Card declined mid-period (`past_due`) | **Stay Active for product access until `currentPeriodEnd`** (decision 3). Optionally mirror Stripe `PAST_DUE` for billing UI without spend/route lock until period end |
| Successful payment / resubscribe Checkout | Clear read-only; `ACTIVE`/`TRIALING`; clear `readOnlyStartedAt`, `cancelAtPeriodEnd`, lock fields (`nextPaymentLockFields` already clears on ACTIVE **200–205**) |
| FREE / COMPED (no Stripe sub) | **Never** read-only; never auto-wipe (decision 5 + “before Stripe is live”) |

### 5.3 Stripe webhooks (when live)

Extend `handleStripeWebhookEvent` (`handle-stripe-webhook.ts` **28+**):

| Event | Plan behavior |
|-------|----------------|
| `customer.subscription.updated` | Sync period end, `cancel_at_period_end`, status; if still entitled for current period → Active; if period ended → Read-only |
| `customer.subscription.deleted` | Enter Read-only (start 30-day clock), **not** immediate wipe |
| `invoice.payment_failed` / `invoice.paid` | Drive PAST_DUE vs restore; product lock only when paid period ended |
| `checkout.session.completed` | Existing sync (**38–71**); clears read-only on success |

Replace seeker cancel path: prefer Stripe `subscriptions.update({ cancel_at_period_end: true })` instead of immediate `subscriptions.cancel` used by `cancelStripeSubscriptionForOrgDelete` (**624**) for **self-serve cancel**. Keep immediate cancel for **wipe** and Comped conversion.

### 5.4 Before Stripe is live

Super Admin FREE/COMPED orgs: `isCompedOrFree` already exempts locks (`payment-lock.ts` **82–87**). Preserve: never set `readOnlyStartedAt`; cron skips them.

---

## 6. Read-only enforcement

### 6.1 Shared check

Evolve `assertOrganizationNotPaymentLocked` / `isSpendBlocked` / `isPaymentLocked` (`payment-lock.ts`) into a clear API, e.g.:

- `isOrganizationReadOnly(profile)` → true when in 30-day window after paid period  
- `assertOrganizationWritable(organizationId)` → throws if read-only (writes + AI)  
- **Remove** full-route redirect for canceled/read-only from `enforcePaymentLockGate` (`payment-lock-gate.ts` **41–45**) so all app pages remain viewable (decision 4). Keep refusing Server Actions via layout gate (**48–56**) and `requireOrganization` → `assertWritableOnServerAction` (`getCurrentOrganization.ts` **48–69**).

Exempt paths (extend `PAYMENT_LOCK_EXEMPT_*` **31–46**):

- `/settings/billing`, Checkout/Portal/credits APIs  
- `/onboarding/eula`, `/support`  
- **Self-serve delete account** action  
- Read-only **view** of every other page (GET)

### 6.2 Must cover (writes / paid work)

**Central choke points (required):**

1. `assertWritableOnServerAction` / `requireOrganization` / `requireOrganizationId` / `requireMembershipInOrganization`  
2. `requireVerifiedForAiSpend` (`authz.ts` **130–135**)  
3. `runPaidStructuredCall` (`paid-call-gate.ts`) — **add** check (gap today)  
4. `processApplicationJob` / `processResearchRun` / enqueue helpers (`enqueueApplicationJob`, research enqueue)  
5. `assertOrganizationNotPaymentLocked` call sites: quota (`quota-service.ts`), research (`company-research-service.ts` **968**), mailbox connect, invites, seats, referral-code, campaign-sharing  

**Server Actions under `src/app/actions/`** that mutate product data (non-exhaustive but must all go through `requireOrganizationId` or equivalent writable assert):  
`application`, `application-assets`, `application-outreach`, `application-summary`, `application-jobs`, `consultation`, `hiring-team`, `interview`, `candidate-profile`, `contact-edit`, `contact-profile`, `campaign-*`, `email`, `research`, `scoring`, `interpretation`, `product-setup`, `persona-setup`, `voice`, `signature`, `mailbox`, `invite`, `import`, `suppression`, `qualification`, `cadence` (prefs may be allowed or blocked — **PO: treat digest preference changes as writes → block in read-only** unless exempted), `settings` org mutations.

**Allow in read-only:** billing portal/checkout/credits/end-trial as applicable, support create (or block — **PO: support tickets contain PII; recommend allow** so locked seekers can ask for help), delete-my-account, logout, password change (**PO: password change is a write to auth — recommend allow** so they can secure the account during read-only).

### 6.3 UI

Replace billing-only shell (`user-menu.ts` **177**, `AppShell` payment banners) with a **read-only banner** on all pages (wording from PO). Do not hide navigation to applications/Harper/etc.

---

## 7. Scheduled wipe

**Pattern:** mirror cadence digest — `POST /api/jobs/account-wipe` with `Authorization: Bearer $CRON_SECRET` (`cadence-digest/route.ts` **13–24**).

**Selection:** billing profiles where org is read-only and `readOnlyStartedAt <= now - 30 days`, and plan is not FREE/COMPED; still has an Organization row.

Reuse constant style from `CONTACT_OUTBOUND_RETENTION_DAYS = 30` (`purge-contact-outbound-shared.ts` **10**) but rename/repurpose to **account read-only retention** (e.g. `ACCOUNT_READ_ONLY_RETENTION_DAYS = 30`) owned by the new lifecycle module — do not keep contact-outbound semantics.

**Idempotency:** wipe is idempotent; cron processes a batch; already-wiped orgs absent → skip; log counts only (no PII) or per §2.

**Render configuration (PO must do):**

1. Set `CRON_SECRET` on web service (same as digest).  
2. Add Render Cron Job: `POST https://<web-host>/api/jobs/account-wipe` every N hours (e.g. daily), header `Authorization: Bearer <CRON_SECRET>`.  
3. Ensure Stripe webhooks still update `readOnlyStartedAt` / period end accurately.  
4. Remove any ops reliance on manual “purge contact outbound” UI.

---

## 8. Reactivation within 30 days

- Checkout / Portal payment success → `syncSubscriptionById` / `checkout.session.completed` sets `ACTIVE`/`TRIALING`, clears `readOnlyStartedAt`, `lockReason`, `cancelAtPeriodEnd` as appropriate.  
- Credit extension on resubscribe after cancel already exists (`extendCompanyResearchCreditsAfterCancelLapse`, `sync-subscription.ts` **234–298**) — keep or revisit under new clock (`readOnlyStartedAt` vs `canceledAt`).  
- All data still present until wipe → full access restored without restore job.  
- After scheduled wipe → must signup fresh; no reactivation of wiped org.

---

## 9. Remove / replace inherited selective purge

| Artifact | Fate |
|----------|------|
| `purgeOrganizationContactOutboundData` (`purge-contact-outbound.ts` **45–187**) | Remove or reduce to dead code; Super Admin uses full wipe only |
| `listPurgeEligibleOrganizations` (**204–262**) | Replace with list of **read-only nearing wipe** (ops visibility) or remove |
| `purgeContactOutboundDataAction` / `PurgeContactOutboundPanel` | Remove; platform org page uses Delete → full wipe |
| `CONTACT_OUTBOUND_*` constants / billing copy (`settings/billing/page.tsx` **284–302**, `ResubscribeCheckoutButton`) | Replace with read-only + 30-day full wipe messaging (**wording from PO**) |
| `PLATFORM_CONTACT_OUTBOUND_PURGED` audit action | Stop writing; optional deprecate |
| Immediate cancel + route lock | Replaced by cancel-at-period-end + read-only viewing (§5–6) |
| 14-day PAST_DUE grace then billing-only shell | Replaced by service through period end then 30-day read-only |
| Company-research introducer credit lapse extension | Keep only if still valid under new timestamps; otherwise rebind to `readOnlyStartedAt` |

---

## 10. Files / functions and schema

### Schema (for approval)

| Change | Why | Safety on existing DB |
|--------|-----|------------------------|
| Add `OrganizationBillingProfile.readOnlyStartedAt DateTime?` | Start 30-day wipe clock distinctly from Stripe `canceled_at` / cancel-at-period-end | Nullable; existing rows null = not read-only; backfill not required for FREE/ACTIVE |
| Optional: add `BillingStatus.READ_ONLY` **or** reuse `CANCELED` with `readOnlyStartedAt` set | Clarity in queries | Enum add is additive migration; reusing `CANCELED` needs **no** enum migration |
| Optional: `BillingLockReason` cleanup / rename later | Align copy | Not required for v1 if read-only is derived from `readOnlyStartedAt` |
| Optional: `AdminAuditEvent` / platform wipe counter (§2) | Ops without PII | Additive |
| Optional: Restrict→SetNull on platform-only User FKs (`ProviderSpendReconciliation`, credit grantor) | Guarantee user delete | Additive migration; existing rows unchanged |

**Recommendation in plan (not a PO decision):** v1 uses **`readOnlyStartedAt` + existing `CANCELED`** to avoid enum churn; cron filters `readOnlyStartedAt != null`.

No Prisma change required for SupportTicket/email/audit **deletion** — explicit `deleteMany` in wipe code.

### Primary code touch list

| Area | Becomes |
|------|---------|
| `src/lib/account/wipe-organization.ts` (new) | Shared full wipe |
| `src/lib/auth/purge-identity.ts` | Called from wipe; keep orphan rules |
| `src/lib/platform/orgs.ts` `deleteOrganization` | Thin wrapper → wipe |
| `src/app/actions/platform-orgs.ts` | Delete uses wipe; remove purge action |
| `src/app/actions/account.ts` + account settings page | Self-serve delete |
| `src/app/actions/workspace.ts` `cancelOwnedOrgSubscriptionAction` | Cancel at period end, not immediate wipe/cancel |
| `src/lib/billing/payment-lock.ts` / `payment-lock-gate.ts` | Read-only vs active; no billing-only redirect for read-only |
| `src/lib/billing/sync-subscription.ts` / `handle-stripe-webhook.ts` | Period-end → read-only; deleted → read-only not wipe |
| `src/lib/billing/markSubscriptionCanceled` | Reinterpret as enter read-only (or rename) |
| `src/lib/ai/paid-call-gate.ts` | Block read-only |
| `src/lib/application-jobs/process.ts` + research process | Skip wiped/read-only |
| `src/app/api/jobs/account-wipe/route.ts` (new) | Cron |
| `src/lib/platform/purge-contact-outbound*.ts` + UI panels | Remove/replace |
| `settings/billing/page.tsx`, banners, `AppShell`, `user-menu.ts` | Read-only UX |
| Middleware exempt list if new cron path | Like cadence-digest (`middleware.ts` **23**) |

---

## 11. Batches (independently testable, in order)

| Batch | Scope | Done when |
|-------|--------|-----------|
| **B1 — Wipe core** | `wipeOrganizationAccount` + Super Admin wired; explicit ticket/email/audit deletes; orphan auth purge; Stripe cancel; no self-serve yet | Postgres wipe test green; Admin delete uses wipe |
| **B2 — In-flight + paid gate** | Job/run abort; `runPaidStructuredCall` + worker guards | Mid-wipe / missing org / read-only cannot spend |
| **B3 — Read-only model** | `readOnlyStartedAt`; cancel-at-period-end; remove route redirect; writable assert; banners | View-all + block writes/AI; FREE never read-only |
| **B4 — Self-serve delete** | Settings UI + action + session end; works while read-only | Owner-only wipe E2E |
| **B5 — Cron wipe** | `/api/jobs/account-wipe` + selection + Render notes | After 30 days wiped; before not |
| **B6 — Remove selective purge** | Delete purge UI/actions/copy; billing copy for new policy | No contact-outbound purge path |
| **B7 — Stripe webhook polish** | invoice.failed/paid, subscription.updated edge cases | Documented webhook matrix covered by tests with fixtures |

Each batch merges only after its TESTS subset passes.

---

## TESTS (to add in implementation — not run here)

1. **Full wipe Postgres:** Seed fully used org (profile, application, research, Harper Q&A, cheat sheet, resume, outreach, contacts, interviews, jobs, receipts, usage, voice, support tickets+notes, transactional email events, admin audit rows). Run wipe. Assert **no** rows with that `organizationId`; no User/AuthUser for solo owner; no SupportTicket/TransactionalEmailEvent/AdminAuditEvent tied by org/user/email; signup with same email creates new org.  
2. **Two-org user:** Member of A+B; wipe A; B intact; User/auth remain.  
3. **In-flight:** PENDING/IN_PROGRESS job + research run; wipe; `processApplicationJob` / research process create nothing and end cleanly.  
4. **Read-only paid gate:** read-only org cannot `runPaidStructuredCall` or enqueue/process paid jobs.  
5. **Self-serve:** OWNER deletes while read-only succeeds; MEMBER cannot; after delete session invalid.  
6. **Read-only viewing:** can GET application/Harper/settings pages; Server Action mutations throw; billing + delete exempt.  
7. **Reactivate:** within 30 days, sync to ACTIVE clears read-only; data still present.  
8. **Cron:** `readOnlyStartedAt` 29 days ago → not wiped; 30+ days → wiped. FREE/COMPED never selected.  
9. **Cancel at period end:** setting cancel does not set read-only until period end simulation.  
10. **Idempotent wipe / Stripe refuse:** second wipe no-ops; wipe with sub id and no Stripe key throws and leaves org.  
11. **Regression:** selective purge action/UI gone or unreachable; platform delete still works.

---

## Risks / unknowns

1. **Multi-seat TEAM orgs:** self-serve OWNER wipe destroys shared workspace for members — confirm product is INDIVIDUAL-only for seekers or require extra confirmation.  
2. **`invoice.payment_failed` vs `currentPeriodEnd`:** exact Stripe timing for “paid period ended” must be pinned in B3/B7 against Stripe’s status transitions.  
3. **Password change / support / digest prefs** during read-only — plan recommends allow password + support; block digest — needs PO confirm.  
4. **ProviderSpendReconciliation Restrict** may block rare user deletes — optional SetNull migration.  
5. **Existing CANCELED orgs in production** already route-locked: migration policy for setting `readOnlyStartedAt` (start clock now vs leave until next webhook) needs PO call — **no silent data repair of application data**, but billing clock backfill is a one-time ops decision.  
6. **Render cron** not in-repo; wipe does nothing in prod until PO configures it.  
7. **Deletion record option** (§2) must be chosen before B1 audit behavior is finalized.

---

## Confirmation

- Aimed Outreach repository was not read or touched.  
- Plan only; no application code or schema implemented in this task.  
- Coding waits on PO approval of this plan (including §2 deletion-record choice and §10 schema).
