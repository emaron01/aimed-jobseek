# Prompt: Reuse generic personas across applications (plan only)

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PLAN ONLY. Do not change any code, configuration, schema, prompts, or data. Write the plan and stop. Coding starts only after the product owner approves it.

GOAL
When the seeker creates a new application, roles are identified automatically as today. For each identified role, check whether it matches a generic persona the seeker has already built on an earlier application. If it is the same generic persona, reuse it on the new application without rebuilding. If it is different, it is built only when the seeker requests it, as today. People (contacts) and each person's own persona never carry over to another application.

PLAN FOR
1. What "the same generic persona" means, and how the match is decided: which fields are compared (role, department, seniority, Direct or Indirect, titles), whether the model decides as part of the identification call it already makes, and how uncertain matches are handled.
2. What is reused: the general persona's built content as is, or copied into the new application. Whether a reused persona that describes the earlier company needs anything changed, and how the plan keeps the new application's persona accurate for the new company without a full rebuild.
3. How the seeker sees a reused persona on the new application, and how they rebuild it for this company if they choose.
4. Effects on outreach and the cheat sheet, which use personas, for the new application.
5. The Personas and Interviewers step color when roles are reused.

THE PLAN MUST INCLUDE
- Files and functions affected, and what each becomes.
- Prompt text to add or change.
- Schema changes, and how they are safe on existing data.
- Risks, and the tests that will prove it.

---

# Plan: Reuse generic personas across applications (awaiting approval)

**Repo:** aimed-jobseek (`https://github.com/emaron01/aimed-jobseek.git`) · **Branch:** main  
**Status:** PLAN ONLY — no product code, schema, or prompt-content changes until approved.

---

## Verdict

Today every application gets its own Hiring Team `Persona` rows after `HIRING_TEAM_IDENTIFY`. Built narrative is **company-specific by prompt**, and there is **no cross-application reuse of built general personas** (only thin `PersonaTemplate` stubs). The right move is: after identification creates role shells on the new application, **match each shell to a previously built general persona** on the same Personal Profile (`organizationId` + `productId`), **copy** that built content onto the new row, mark provenance, and count it as built for step color / outreach / cheat sheet — without carrying contacts or individual profiles. Uncertain matches stay unbuilt. Company accuracy without a full rebuild is handled by a **visible Reused badge** plus the existing Rebuild action (and an optional cheap company-relabel pass if approved).

---

## Current behavior (baseline)

| Step | What happens |
|---|---|
| Identify | After research: `HIRING_TEAM_IDENTIFY` → `syncApplicationHiringTeam` creates/updates campaign `Persona` shells (`setupStatus: NOT_STARTED`, `profileJson.narrative: null`). Prompt v2; does not draft persona. |
| Build | Seeker requests Build → `HIRING_TEAM_BUILD` → `rebuildApplicationHiringTeamRole` / `synthesizeHiringTeamRole`. Prompt v13; **every sentence must be specific to this role at this company**. |
| Person persona | `CampaignContact.individualProfileJson` via `CONTACT_PROFILE`. Never merges into general persona. |
| Step color | Direct roles only: green when every Direct role is built (`isHiringTeamPersonaBuilt`). |
| Templates | `PersonaTemplate` = name / titles / department / why / notes only — **not** built narrative. |

---

## 1. What “the same generic persona” means, and how match is decided

### Definition

Two roles are the **same generic persona** when they describe the **same hiring-function role family** for this seeker’s Personal Profile — e.g. both are “Hiring Manager”, both are “Recruiter / TA”, both are “CS leader” — **regardless of employer**. They are **not** the same person/contact, and they are **not** a match merely because involvement is Direct.

### Fields compared (product code, deterministic)

Match candidates are prior **built** application personas for the same `organizationId` + `productId` (any earlier `campaignId`, not archived).

Compare, in order:

| Signal | Weight | Notes |
|---|---|---|
| `suggestionKey` / `profileJson.roleKey` | Strong | e.g. `hiring_manager` must only match `hiring_manager` |
| `profileJson.involvement` (DIRECT / INDIRECT) | Required equal | Do not reuse a Direct build onto an Indirect shell or vice versa |
| Role family / name / titles | Strong | Reuse existing `rolesDescribeSamePerson` + `roleFunctionFamily` from `identify.ts` |
| `department` | Supporting | Equal when both non-null; null does not block |
| `seniority` | Supporting | Equal when both non-null; null does not block |
| `targetTitles` / `likelyTitles` | Supporting | Title set overlap (same helper as identify) |

**Not compared:** employer, campaign, contacts, individual profiles, narrative text (that would overfit to the old company).

### Who decides: not the identification model by default

**Recommendation: product code decides after identification returns**, not inside the identify call.

Why:
- Identification already returns job-specific roles; stuffing a library of prior personas into that call increases tokens, risk of inventing `personaId`s, and couples two jobs.
- Matching is the same class of problem as intra-app dedupe (`rolesDescribeSamePerson`), which is already code.

Flow:

1. `syncApplicationHiringTeam` creates/updates shells as today (job-specific `whyInvolved`, evidence, involvement).
2. New step `reuseBuiltHiringTeamPersonas(campaignId)` runs in the same identify job (or immediately after sync in `processApplicationJob` for `HIRING_TEAM_IDENTIFY`):
   - Load built library for this product.
   - For each new shell that is **not** already built, find the best library match.
   - If confidence is **high**, copy reuse (see §2).
   - If **uncertain or none**, leave unbuilt (seeker Builds as today).

### Uncertain matches

Treat as **no reuse** (fail closed):

- Two library candidates score equally high for one shell.
- Role keys differ but names are vaguely similar (e.g. “Revenue Ops” vs “Sales Ops”) without shared family/title.
- Involvement differs.
- Library persona is stale (`staleAt` set) or `setupStatus` is not built.
- Shell is seeker-added custom with no stable `suggestionKey` and weak title overlap.

No model tie-break in v1. (Optional later: a small structured call only when two candidates remain — out of scope unless PO asks.)

### Optional alternative (not recommended for v1)

Pass a compact library fingerprint list into identification and ask for `reuseSuggestionKey` / null. Rejected for v1 because IDs and uncertain ties are safer in code, and identify should stay “name the team for this job.”

---

## 2. What is reused (copy vs live), and company accuracy

### Copy into the new application (not a live shared row)

Reuse **copies** built content onto the **new campaign’s `Persona` row**. Do not point two applications at one `Persona` id (`campaignId` is unique ownership; cascade delete would break the other app).

Copy:

- Narrative: `profileJson.narrative` (full `HiringTeamNarrative`)
- Flattened columns used by UI/outreach: `definition`, `responsibilities`, `painPoints`, `desiredOutcomes`, `messagingNotes`, `additionalContext`, `seniority`, `department`, `targetTitles` (keep new shell’s identification name/titles/why when they are more accurate for **this** job)
- Status: `setupStatus` / `approvalStatus` → `NEEDS_REVIEW` (built, same as fresh synthesis)
- `interpretationPromptVersion` from source (or mark `reused`)
- Clear `staleAt` / `staleReason` on the new row

Keep from the **new** identification shell (do not overwrite with old job’s identify payload):

- `name`, `whyThisPersonaMatters` / identify `whyInvolved`, `profileJson.identification`, evidence for **this** job, `involvement`, `suggestionKey`

Provenance on the new row (in `profileJson`, no required schema column):

```ts
reuse: {
  sourcePersonaId: string;
  sourceCampaignId: string;
  sourceCompanyName: string | null;
  reusedAt: string; // ISO
}
```

### Company-specific content without a full rebuild

Built personas today **name the prior employer** by design (synthesis prompt). Options:

| Option | Cost | Accuracy | Proposal |
|---|---|---|---|
| A. Copy as-is + badge “Reused from {company}” + Rebuild | Zero AI | Seeker sees old company until rebuild | **Default for v1** |
| B. Cheap company-relabel pass (replace employer nouns / “at Acme” with new company; keep role pressures/structure) | One small call | Better for outreach/cheat sheet | **Optional Pass 2 if PO wants** |
| C. Full re-synthesis | Full build cost | Best | Already available via Rebuild; not automatic |

**v1 recommendation:** Option A. Reuse means “skip the expensive synthesis.” Honesty in the UI beats a silent wrong-company narrative. Rebuild remains one click for company-specific refresh. Option B only if PO rejects showing prior-company wording in outreach/cheat sheet.

Do **not** invent a stripped “generic-only” narrative in v1 — the stored shape does not separate generic vs company sentences cleanly.

### Never reused

- `CampaignContact` rows, LinkedIn paste, `individualProfileJson`, cheat sheet notes, interview stages
- Product-level personas (`campaignId: null`)
- Unbuilt or failed library rows
- Templates alone (unless they were already turned into a built application persona)

---

## 3. How the seeker sees it, and how they rebuild

### UI (Personas and Interviewers / Application workspace)

On a reused role card:

- Show as **built** (same as today’s built state — overview / pressures / etc. visible).
- Badge / line: **Reused from {source company or application name}** (from `profileJson.reuse`).
- Primary actions: existing **Rebuild** (for this company) and involvement move; do not show “Build” as if empty.
- Copy for rebuild: reuse existing `hiringTeamConfig.actions.rebuild` (or add `rebuildForThisCompany` if PO wants clearer wording).

`rebuildApplicationRoleAction` / `rebuildApplicationHiringTeamRole` already re-synthesizes for **this** campaign’s job + research. After rebuild:

- Clear `profileJson.reuse` (or set `reuse.supersededAt`)
- Existing cheat sheet enqueue path runs (`enqueueCheatSheetSectionsForPersona`)

No new modal required for v1.

---

## 4. Effects on outreach and the cheat sheet

Both already load **this campaign’s** `Persona` by id and read columns / `profileJson`:

| Consumer | Effect of reuse copy |
|---|---|
| Outreach (`generateOutreachAsset` / `loadApplicationGenerationContext`) | Sees a built persona immediately; can generate without queuing `HIRING_TEAM_BUILD`. Content may still name the prior company until rebuild (see §2). |
| Cheat sheet (`loadSummaryData` / `personaNarrative`) | Same: persona sources available. After reuse, optionally enqueue cheat sheet sections once (same as post-build) so the sheet is not empty. |
| Harper coach (`loadCoachHiringTeam` → `generalPersona`) | General persona present; people list still only contacts on **this** application. |

Contacts never appear on the new app from reuse. Matching people to roles stays the current title/confirm flow on this campaign only.

If outreach was blocked waiting on build, reuse removes that wait for matched Direct roles. Deferred-outreach-after-build paths remain for roles that did not reuse.

---

## 5. Personas and Interviewers step color

Unchanged rules, new inputs:

- `hiringTeamRoleCount` / `hiringTeamBuiltCount` still count **Direct only**.
- A reused Direct role is **built** (`isHiringTeamPersonaBuilt` true via narrative / `NEEDS_REVIEW`).
- Therefore: if identification yields N Direct roles and all N reuse successfully → step goes **green** without seeker Builds.
- If some Direct roles reuse and others do not → **yellow** until remaining Direct roles are built (or moved Indirect).
- Indirect reused roles do not affect the step color (same as today).
- Active `HIRING_TEAM_IDENTIFY` / `HIRING_TEAM_BUILD` jobs still show in-progress / spinner as today.

Result key `hiring-team:built:{built}:{total}` updates when reuse completes inside the identify job, so the NEW pill / unread behavior stays consistent.

---

## Files and functions affected

| File / function | Becomes |
|---|---|
| `src/lib/hiring-team/build.ts` — `syncApplicationHiringTeam` | After syncing shells, call reuse helper (or return shells for the job to reuse). |
| **New** `src/lib/hiring-team/reuse.ts` | `listReusableHiringTeamPersonas`, `matchReusablePersona`, `applyPersonaReuseCopy`, confidence thresholds. |
| `src/lib/application-jobs/process.ts` — `HIRING_TEAM_IDENTIFY` | After `syncApplicationHiringTeam`, run reuse; enqueue cheat sheet for reused roles if needed. |
| `src/lib/hiring-team/identify.ts` — `rolesDescribeSamePerson` / family helpers | Shared by reuse matcher (export/adjust as needed). |
| `src/lib/hiring-team/build.ts` — `isHiringTeamPersonaBuilt`, `rebuildApplicationHiringTeamRole` | Rebuild clears reuse provenance; built check unchanged. |
| `src/lib/application/tracker.ts` | No rule change; built count rises when reuse writes narrative. |
| `src/components/ApplicationWorkspace.tsx` | Show Reused badge from `profileJson.reuse`; Build vs Rebuild labels when reused. |
| `src/lib/product-config` hiring-team copy | Badge / rebuild-for-this-company strings. |
| `src/lib/application-summary/enqueue.ts` | After reuse, enqueue sections for affected roles (mirror post-build). |
| Outreach / generation context | No structural change; benefits from built copy. |
| Tests: `hiring-team.test.ts`, `step-progress.test.ts`, workspace/UI tests | Cover match, no-contact-carry, green-when-all-reused, uncertain no-reuse. |

**Unchanged by design:** contact profile prompts, consultation person vs general separation, `PersonaTemplate` CRUD (optional later: “save built as template” remains separate).

---

## Prompt text to add or change

### Identification (`HIRING_TEAM_IDENTIFICATION_SYSTEM_INSTRUCTIONS`) — **no change in v1**

Keep identify focused on this job’s team. Matching is product code after the call. **Do not** bump identify prompt version for reuse alone.

### Synthesis (`PERSONA_SYNTHESIS_SYSTEM_INSTRUCTIONS`) — **no change for automatic reuse**

Full synthesis still runs only on Build / Rebuild. Remains company-specific.

### Optional Pass 2 — company-relabel system instructions (only if PO chooses Option B)

New small prompt, e.g. `PERSONA_REUSE_RELABEL_SYSTEM_INSTRUCTIONS`:

> You adapt one Hiring Team persona that was written for a previous employer to a new employer for the same role. Replace employer-specific names and company facts with the new employer’s name and research when present. Keep role pressures, needs, concerns, and talking-point structure. Do not invent new responsibilities. Do not draft a full new persona. Return the same narrative JSON shape.

Bump a new `PERSONA_REUSE_RELABEL_PROMPT_VERSION = "1"` only if that pass ships.

### Coach / outreach prompts — **no change**

They already consume whatever general persona is on the campaign.

---

## Schema changes

**v1: none required.** Provenance lives in existing `Persona.profileJson` (`reuse` object). Safe on all existing rows (absent `reuse` = not reused).

Optional later (not needed to ship):

- `reusedFromPersonaId String?` column for querying — additive, nullable, safe.

No migration of historical applications. No backfill.

People/contacts: no schema change; carry-over is forbidden in service code (do not copy `CampaignContact`).

---

## Risks and tests

### Risks

| Risk | Mitigation |
|---|---|
| Wrong role matched (e.g. CS Manager → Support Manager) | Fail closed on uncertainty; require roleKey/family + involvement; tests for near-misses |
| Old company named in outreach/cheat sheet | Reused badge; Rebuild; optional relabel Pass 2 |
| Stale library persona (posting changed) | Skip library rows with `staleAt`; rebuild on source app does not auto-push to others |
| Sharing one Persona across campaigns | Always copy; never share id |
| Contacts leaking | No contact copy; tests assert zero contacts after identify+reuse on empty app |
| Step turns green too early | Only count Direct built; Indirect reuse ignored for color |
| Cost surprise | Reuse adds **zero** synthesis calls; identify cost unchanged |

### Tests that will prove it

1. **Match:** Built Hiring Manager on App A → identify App B with HM → App B HM row has narrative copy + `profileJson.reuse.sourcePersonaId` = A’s id; distinct Persona ids.
2. **No match:** App B identifies a unique Indirect role with no library peer → remains `NOT_STARTED`, no narrative.
3. **Uncertain:** Two similar library CS roles → no reuse.
4. **Involvement:** Direct library must not attach to Indirect shell.
5. **People:** App B has no contacts after reuse; `individualProfileJson` never copied.
6. **Step color:** All Direct roles reused → `resolveApplicationStepState("hiring-team")` = `done`; one Direct unbuilt → `in_progress`.
7. **Rebuild:** Rebuild on reused role clears reuse provenance and writes new company-specific narrative; cheat sheet enqueue called.
8. **Outreach source:** Generation context for App B includes reused persona PERSONA source without requiring `HIRING_TEAM_BUILD`.
9. **Regression:** Existing identify guardrails and App A/B id isolation tests still pass.

---

## Proposed coding passes (after approval)

1. **Pass A — Matcher + copy + provenance** in identify job; unit tests for match/uncertain; no UI badge yet (built state alone).
2. **Pass B — UI badge + Rebuild clears reuse**; step-color + cheat sheet enqueue tests.
3. **Pass C (optional) — Company-relabel** cheap adapt after copy, only if PO rejects prior-company wording in outreach/cheat sheet.

---

## Open decisions for the product owner

1. Confirm **code-side match after identify** (not model-in-identify).
2. Confirm **v1 = copy as-is + Reused badge** (Option A) vs require **company-relabel** (Option B) before showing as built.
3. Library scope: **same product** only (recommended) vs whole organization across products.
4. Should reused personas auto-enqueue cheat sheet sections immediately, or wait until the seeker opens Summary?

---

*End of plan. No code, schema, or prompt-content changes were made in this task beyond saving this prompt/plan document.*
