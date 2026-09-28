# Prompt: Persona reuse across applications — complete report

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
All findings must be based on the actual code as it exists now. Cite file paths, function names, and line numbers for every claim. No guesses; if something cannot be determined from the code, say so explicitly.

SURGICAL RULE
REPORT ONLY. Do not change any code, configuration, schema, prompts, tests, or data. Write the report and stop.

CONTEXT
Plan for persona reuse across applications existed; this report completes omitted sections under product-owner decisions (copy + company-name swap, no badge, no cheat sheet/outreach enqueue, people never carry over).

---

# Report: Persona reuse across applications (complete)

**Repo confirmed:** `C:/Repos/aimed-jobseek` → `https://github.com/emaron01/aimed-jobseek.git` (`main`)  
**Status:** REPORT ONLY — no code, schema, prompt, test, or data changes.

**Product-owner decisions applied:** copy onto new campaign Persona (not shared id); company-name swap only (no full rebuild on reuse); no seeker-visible reuse indication; full rebuild only via existing rebuild path; people / person-level layers / cheat sheets never carry over; reuse must not auto-enqueue cheat sheet or outreach.

---

## 1. General persona inputs and content inventory

### 1a. Inputs the general persona build actually uses

Entry: `rebuildApplicationHiringTeamRole` → `draftsFor` → `synthesizeHiringTeamRole` → `draftRoleWithModel` → `buildPersonaSynthesisMessages`  
(`src/lib/hiring-team/build.ts` 639–720, 186–218; `src/lib/hiring-team/ai.ts` 68–120, 145+; `src/lib/persona-research/prompt.ts` 9–116).

| Input | Assembled by | Citation |
|---|---|---|
| Job requirement fields | `loadApplication` → `HiringTeamJobEvidence` | `build.ts` 98–125: title, companyName, location, workArrangement, employmentType, seniority, reportingLine, responsibilities, requiredItems, preferredItems, scorecard |
| Job evidence text in excerpts | `hiringTeamEvidenceExcerpts` → `jobRequirementEvidenceText` | `evidence.ts` 35–64, 83–95 |
| Company research (conditional) | `loadApplication` + `includeResearch` gate | `build.ts` 107–134, 109–112: only when `employerDisposition === "IDENTIFIED"` and research status `COMPLETED` or `PARTIAL` |
| Research evidence text | `companyResearchEvidenceText` | `evidence.ts` 66–78, 96–104: companySummary, whatTheySell, businessModel, hiringSignals, riskSignals |
| Role identity for this build | Identified role (or Persona fallback) | `build.ts` 671–687; passed as `roleName`, `likelyTitles`, `department`, `whyThisRoleMatters`, `involvement` in `draftsFor` 207–211 |
| Peer differentiation | Other Personas on **same campaign** | `build.ts` 693–719: peers’ `painPoints` / `messagingNotes` → `existingApprovedPersonas` in messages (`prompt.ts` 49–55) |
| Seeker notes | `persona.additionalContext` | `build.ts` 713 `notesFor: () => persona.additionalContext` |
| AI provider | Persona AI only | `ai.ts` 80–92: `getPersonaAiProvider()`; config env `PERSONA_AI_*` (`src/lib/ai/config.ts` 143–151) |
| Prompt version | `PERSONA_SYNTHESIS_PROMPT_VERSION = "13"` | `src/lib/persona-research/contract.ts` (constant); system message in `prompt.ts` 20–22 |

**Not used in general persona build (proven absent):**

- Personal Profile / `Product.profileJson`: `loadApplication` selects only `campaign.id` and `productId` (`build.ts` 88–92); no candidate-profile parse in the hiring-team build path.
- ICP context / product messaging: `draftRoleWithModel` sets `productMessaging: null`, `icpContext: null`, `personaEvidence: []` (`ai.ts` 105–118).
- Contacts / `individualProfileJson`: not loaded in `rebuildApplicationHiringTeamRole`.

Note: `jobLines` is computed in `draftsFor` (`build.ts` 196) and passed into `synthesizeHiringTeamRole`, but `draftRoleWithModel` does not put `jobLines` into messages — job content reaches the model via **excerpts** only.

### 1b. Field inventory and classification

**`Persona` columns** (`prisma/schema.prisma` 1443–1485) relevant to application Hiring Team roles:

| Field | Classification | Notes |
|---|---|---|
| `id`, `organizationId`, `productId`, `campaignId` | Identity / ownership | New row on reuse (copy, not shared id) |
| `personaTemplateId` | Meta | Usually null for identify-created roles |
| `name` | Role-level | From identification (`personaFields` `build.ts` 244) |
| `targetTitles` | Role-level | From identification likelyTitles |
| `department` | Role-level (when set) | From identification |
| `seniority` | Role-level if set | Column exists; **`personaFields` does not write it** on hiring-team build (`build.ts` 241–268) — typically remains null for these rows |
| `suggestionKey` | Role-level | `role.roleKey` (`build.ts` 264) |
| `whyThisPersonaMatters` | Job- or company-specific substance | From identify `whyInvolved` for **this** job (`build.ts` 247); not from synthesis narrative |
| `definition` | Job- or company-specific substance | ← `narrative.overview` (`build.ts` 248) |
| `responsibilities` | Job- or company-specific substance | ← joined `narrative.needs` (`build.ts` 249) |
| `desiredOutcomes` | Job- or company-specific substance | ← same needs join (`build.ts` 256) |
| `painPoints` | Job- or company-specific substance | ← pressures + concerns (`build.ts` 250–255) |
| `messagingNotes` | Job- or company-specific substance | ← talkingPoints + communication + interviewStage (`build.ts` 257–262) |
| `additionalContext` | Seeker notes | Not produced by synthesis; may be seeker-edited |
| `profileJson` | Mixed — see below | |
| `setupStatus`, `approvalStatus` | Meta | Built = `NEEDS_REVIEW` / `APPROVED` or narrative present (`isHiringTeamPersonaBuilt` `build.ts` 271–284) |
| `interpretationPromptVersion`, `interpretationVersion`, `lastInterpretedAt` | Meta | Prompt version set to synthesis v13 (`build.ts` 265) |
| `staleAt`, `staleReason`, approval FKs, `manuallyEditedFields`, `archivedAt`, `personaMessagingJson` | Meta / other | Not synthesis prose |

**`profileJson` shape** (`profilePayload` `build.ts` 62–86):

| Path | Classification |
|---|---|
| `includeResearch` | Meta |
| `roleKey` | Role-level |
| `involvement` | Role-level (Direct/Indirect) |
| `identification` (name, likelyTitles, department, involvement, whyInvolved, evidence, roleKey) | Mixed: identity Role-level; `whyInvolved` / evidence Job-specific |
| `evidence[].text` | Job- or company-specific substance (verbatim job + research text for **this** app) |
| `narrative.overview` | Job- or company-specific substance (prompt-forced) |
| `narrative.pressures[]` | Job- or company-specific substance |
| `narrative.impact` | Job- or company-specific substance |
| `narrative.needs[]` | Job- or company-specific substance |
| `narrative.concerns[]` | Job- or company-specific substance |
| `narrative.talkingPoints[]` | Job- or company-specific substance |
| `narrative.communication[]` | Mostly Role-level; may include Name-only if company is mentioned |
| `narrative.interviewStage` | Role-level (fixed stage vocabulary for Direct) |
| `narrative.evaluates[]` | Job- or company-specific substance (what they evaluate for **this** hire) |
| `modelNote`, `corrections`, `dropped` | Meta |

**Name-only** (accurate after company-name swap **if** that is the only employer-specific token): any surface occurrence of the prior employer string inside the substance fields above. There is **no** dedicated “companyName” field on the Persona; the name appears only inside free-text narrative/columns/evidence when the model or evidence text included it.

### 1c. Prompt instructions that produce Name-only and Job-/company-specific substance

From `PERSONA_SYNTHESIS_SYSTEM_INSTRUCTIONS` (`src/lib/prompt-content/persona-synthesis.ts`):

**Company- and job-specificity (drives Job- or company-specific substance for overview, pressures, impact, needs, concerns, talking points, evaluates):**

> Lines 6–12: “You synthesize ONE Hiring Team role for a **specific job at a specific employer**.” … “Every sentence must say something specific to **this role at this company**.” … “A different role at a different company must be different.”

> Lines 10–11: Overview / pressures / impact / needs / concerns / talking points are defined in terms of **this hire**, first-month outcomes, and company-context examples (“Director of Engineering at a robotics company…”).

**Name-only (employer naming):**

> Line 8: “When company research is absent, infer the industry from the job requirement and **do not invent the employer's name**.” (Implies when research/job name the employer, the draft may use it.)

**Interview stage / evaluates (Direct):**

> Line 22: “If involvement is DIRECT, interviewStage is one of: recruiter screen; hiring manager chronological walk-through; …” and “Also say what they evaluate.”

Identification prose (`whyThisPersonaMatters`) comes from a **different** prompt (`HIRING_TEAM_IDENTIFICATION_SYSTEM_INSTRUCTIONS` in `src/lib/prompt-content/hiring-team-identification.ts` lines 12–18: name, likelyTitles, department, involvement, whyInvolved, evidence) — job-grounded, not the synthesis narrative.

### 1d. Example structure of a built general persona (field names only)

```
Persona {
  id, organizationId, productId, campaignId,
  name, suggestionKey, targetTitles, department, seniority?,
  whyThisPersonaMatters,
  definition, responsibilities, desiredOutcomes, painPoints, messagingNotes,
  additionalContext?,
  setupStatus, approvalStatus, interpretationPromptVersion,
  staleAt?, manuallyEditedFields?,
  profileJson: {
    includeResearch, roleKey, involvement,
    identification: { roleKey, name, likelyTitles, department, involvement, whyInvolved, evidence[] },
    evidence: [{ sourceId, displayName, text }],
    narrative: {
      overview: { text, kind },
      pressures: [{ text, kind }],
      impact: { text, kind },
      needs: [{ text, kind }],
      concerns: [{ text, kind }],
      interviewStage: { text, kind } | null,
      evaluates: [{ text, kind }],
      talkingPoints: [{ text, kind }],
      communication: [{ text, kind }]
    },
    modelNote, corrections, dropped
  }
}
```

(`HiringTeamNarrative` type: `src/lib/hiring-team/draft-quality.ts` 11–21.)

### 1e. Would name-swap reuse produce an accurate general persona for a new job?

**No — not in general.**

A company-name swap can remove or replace employer tokens (Name-only). It does **not** rewrite job-description-specific substance that the synthesis prompt requires: first-month needs, hire-specific impact/concerns, talking points tied to **that** posting’s work, evaluates for **that** hire, and pressures grounded in that job’s domain (e.g. “fleet reliability” for a robotics posting). Those live in `definition` / `responsibilities` / `desiredOutcomes` / `painPoints` / `messagingNotes` and `profileJson.narrative.*` (and copied `profileJson.evidence` would still be the **old** job/research text if left in place).

**Fields that break accuracy for a different job (even after a perfect name swap):**  
`definition`, `responsibilities`, `desiredOutcomes`, `painPoints`, `messagingNotes`, `whyThisPersonaMatters` (if kept from old identify), `profileJson.narrative` (overview, pressures, impact, needs, concerns, talkingPoints, evaluates), and `profileJson.evidence` / `identification` if copied from the source app without replacement from the **new** shell.

**What remains usable across jobs for the same role family:** role identity (`name`, `suggestionKey`, `targetTitles`, `department`, `involvement`), and often `interviewStage` vocabulary for Direct roles.

Under the PO decision (name swap only, no full rebuild on reuse), the product accepts that reused prose is role-family transfer with employer renamed, **not** a fresh synthesis for the new posting. Implementation should still **replace identification/evidence on the new row from the new shell** (see §7) so at least identify-side fields and stored evidence match the new application, while narrative columns are name-swapped copies.

---

## 2. Name swap options

### 2a. Deterministic text replacement in code

**Structured company-related strings available in data:**

| Form | Source |
|---|---|
| Job employer string | `JobRequirement.companyName` → evidence line `Employer: …` (`evidence.ts` 51; `build.ts` 115) |
| Company legal/display name | `Company.name` (`schema.prisma` 1918) |
| Normalized name | `Company.normalizedName` (`schema.prisma` 1919) |
| Domain | `Company.website`, `Company.normalizedDomain` (`schema.prisma` 1920–1921) |

**Not structured as separate fields:** short marketing names, possessives (“Acme’s”), ticker abbreviations, product names, brand nicknames. Those appear only if the model or research free text (`companySummary`, `whatTheySell`, etc.) introduced them — there is **no** inventory of aliases in code.

**What deterministic swap would miss:**

- Partial/abbreviated forms not equal to `companyName` / `Company.name` / domain
- Product or brand names used as stand-ins for the employer
- Possessive and plural morphology unless every variant is generated
- False positives if a token coincides with a common English word (cannot be ruled out without a denylist — not in code today)
- Industry phrases that are not the company name but are still wrong for the new job (not a “name” problem — see §1e)

### 2b. Small model call that only swaps company references

| Topic | Finding |
|---|---|
| Full build model | Persona AI: `getPersonaAiProvider()` (`ai.ts` 92); env `PERSONA_AI_MODEL` (`config.ts` 143–151; `.env.example` 212). Exact deployed model string is **env-specific; not fixed in repo**. |
| Full build prompt size | System = prompt v13 + full `PERSONA_SYNTHESIS_SYSTEM_INSTRUCTIONS` (`prompt.ts` 20–22). User JSON includes role snapshot, peers, `responseSchema` blob, and evidence texts truncated to **6_000** chars each excerpt (`prompt.ts` 36–40) — typically job + optional research. Up to **2** synthesis attempts (`synthesizeHiringTeamRole` loop in `ai.ts`). |
| Cheaper existing configs | `consultation_reply` (`CONSULTATION_REPLY_AI_*`, `config.ts` 180–188; roles.ts 151–164: extract/polish/next-step) and `email_facts` (`EMAIL_FACTS_AI_*`). Neither is used for persona synthesis today. **Recommendation:** use **`getConsultationReplyAiProvider()`** for a dedicated relabel structured call (same “small reply” role family already used for cheap transforms). Exact cost ratio cannot be computed from the repo (model names empty in `.env.example`); qualitatively: one short JSON in/out vs full personaSynthesis schema + up to 12k evidence chars + retry. |
| Proposed I/O | Input: prior narrative + flattened columns; `fromCompany` strings (job companyName, Company.name, normalizedName, domain); `toCompany` strings for the new app; instruction “replace company references only.” Output: same `HiringTeamNarrative` + same column strings. |
| Validation | Reject if any non-string structural change; require equal array lengths for narrative lists; require that after normalizing both old/new company token sets, every remaining token-difference is only accounted for by allowed company substitutions (or that `diff` of texts is only those substitutions). On validation failure → **no reuse** (fail closed), leave shell unbuilt. |

### Recommendation

**Use a small structured model call (`consultation_reply` provider) for the name swap**, with deterministic pre-pass for exact `companyName` / `Company.name` / domain strings, and fail closed if validation fails.

Reasons: deterministic-only cannot cover abbreviations/product names the model already wrote into prose; PO requires the earlier company name never appear; full Persona AI rebuild is explicitly out of scope for reuse. Cost stays far below a full build because the payload is the existing narrative only, not job+research re-synthesis.

---

## 3. Match logic (`rolesDescribeSamePerson`)

### Exact current logic

Function: `rolesDescribeSamePerson` — `src/lib/hiring-team/identify.ts` **188–219**.

**Inputs (type):**  
`Pick<IdentifiedHiringRole, "name" | "likelyTitles" | "whyInvolved" | "roleKey">` — **does not take** `department`, `seniority`, or `involvement`.

**Normalization:** trim + `toLowerCase` for names/titles; `contentTokens` (`identify.ts` 109–115) lowercases, strips non-alphanumerics, keeps tokens with **length ≥ 4**.

**Comparisons (in order):**

1. If either `roleKey === "hiring_manager"` → true **only if both** are `hiring_manager` (192–194).
2. Exact case-insensitive `name` equality → true (195).
3. Same `roleFunctionFamily` key → true (196–198). Families (`ROLE_FAMILIES` 136–161): `customer_success`, `executive_sponsor`, `talent_acquisition`, `revenue_operations` only — matched via regex on name/titles (`roleFunctionFamily` 163–168).
4. Shorter name has ≥2 words and is a substring of the longer → true (199–209).
5. Any shared `likelyTitles` entry (trim, lower) → true (211–215).
6. Else Jaccard of token sets from `[name, ...likelyTitles, whyInvolved]` ≥ **0.45** → true (216–218). `jaccard` 121–128.

**Designed for:** intra-application identification **deduplication** (same hire’s team), used from guardrails / merge (`identify.ts` ~297, 368, 408; `merge-existing.ts`). Not designed for cross-company library matching.

**Compared today:** titles (yes), role family (yes, limited set), name, whyInvolved (via Jaccard), roleKey (special case for HM).  
**Not compared:** department, seniority, involvement (Direct/Indirect).

### Behavior across two companies / job descriptions

| Case | Behavior |
|---|---|
| Both Hiring Manager | Always match each other (step 1), even if titles/reporting lines differ |
| Both “Recruiter” / TA family | Match via family (step 3) across companies |
| Same generic name “Sales Manager” | Match via name (step 2) even if jobs differ completely |
| Shared title string | Match (step 5) even if role names differ |
| Overlapping whyInvolved jargon | May match via Jaccard ≥ 0.45 (step 6) — **wrong match risk** across unrelated jobs |
| Roles outside the four families with different names/titles | Often **no match** even when seeker would call them the same function — **wrong non-match** |
| Direct vs Indirect same name | **Would still match** if only `rolesDescribeSamePerson` is used — involvement must be enforced separately |

### What “uncertain” means in code (no reuse)

A candidate is **high-confidence** only if **all** of:

1. Library persona is built (`isHiringTeamPersonaBuilt`) and not archived; same `organizationId` + `productId`; different `campaignId`.
2. `hiringTeamInvolvement(library.profileJson) === hiringTeamInvolvement(shell.profileJson)`.
3. `rolesDescribeSamePerson(asRole(library), asRole(shell))` is true.
4. Prefer `suggestionKey` / `roleKey` equality when both non-null; if keys differ and match was only via Jaccard (step 6) without family/name/title hit → treat as **uncertain**.

**Uncertain → no reuse** when:

- Zero high-confidence candidates, or
- More than one high-confidence candidate remains after the tie-break in §4 fails to produce a unique winner, or
- Name-swap validation fails (§2).

---

## 4. Multiple matches

When more than one library persona is high-confidence for one shell:

1. Prefer candidates with **exact** `suggestionKey` / `roleKey` match to the shell.
2. Among remaining, pick the single newest by `lastInterpretedAt ?? updatedAt` (most recently built/updated).
3. If two share the same timestamp and same key (or neither has a unique newest), **uncertain → no reuse**.

Do not merge library personas. Do not ask the identify model to choose.

---

## 5. Direct vs Indirect

**Both**, with the hard rule that involvement must be equal (§3).  
Direct library → Direct shell only; Indirect → Indirect only.  
Step color still counts **Direct only** (`tracker.ts` 155–162); Indirect reuse does not affect green.

---

## 6. Rebuild

Existing path: seeker action → `queueHiringTeamBuild` / `rebuildApplicationRoleAction` → job `HIRING_TEAM_BUILD` → `rebuildApplicationHiringTeamRole` (`process.ts` 74–80; `build.ts` 639–757).

On successful rebuild today, `profileJson` is fully rewritten via `profilePayload` with new narrative (`build.ts` 747–755). Any reuse provenance stored under `profileJson.reuse` would be **dropped** unless explicitly re-added (implementation must omit `reuse` on rebuild write).

**Step color:** remains built if narrative/setupStatus stay built (`isHiringTeamPersonaBuilt`). Rebuild replaces content in place; built count unchanged unless rebuild fails (`PARTIAL`/`FAILED` without narrative — then may leave non-built and turn step yellow).

Post-rebuild, **existing** code enqueues cheat sheet sections (`process.ts` 82–90). That is the rebuild/build path, **not** reuse.

---

## 7. Execution

| Topic | Spec |
|---|---|
| Where | **Worker only**, inside `HIRING_TEAM_IDENTIFY` handling in `processApplicationJob` (`process.ts` 68–72), **after** `syncApplicationHiringTeam` returns. Not in a page request / RSC load. |
| Order | (1) `syncApplicationHiringTeam` creates/updates shells as today (`build.ts` 320–429). (2) New `reuseBuiltHiringTeamPersonasForCampaign`. (3) For each unbuilt shell: match → copy narrative/columns from library → name-swap → write onto **that shell’s** Persona id. (4) **Do not** call `enqueueCheatSheetSectionsForPersona` or enqueue `OUTREACH`. |
| New shell fields kept from identify | `name`, `targetTitles`, `department`, `whyThisPersonaMatters`, `suggestionKey`, `profileJson.identification`, `profileJson.evidence`, `involvement`, `includeResearch` from **new** app (`sync` already wrote these). |
| Copied then name-swapped | `definition`, `responsibilities`, `desiredOutcomes`, `painPoints`, `messagingNotes`, `profileJson.narrative`, set `setupStatus`/`approvalStatus` to built (`NEEDS_REVIEW`), set `interpretationPromptVersion` from source or mark reuse. |
| Provenance (internal only) | `profileJson.reuse = { sourcePersonaId, sourceCampaignId, reusedAt }` — **never shown in UI** (PO: no badge). |
| Partial failure | Per-role transaction or update: if swap/validation fails for one role, leave that role unbuilt; do not roll back successful siblings. Job can complete; unbuilt roles remain Buildable. |
| Retry / idempotency | Reuse only when `!isHiringTeamPersonaBuilt(shell)` **or** existing `profileJson.reuse.sourcePersonaId` equals the chosen library id (refresh swap). Never `persona.create` for reuse — only update the shell created by sync. Second IDENTIFY run: built reused rows become `stale` under current sync logic if built (`build.ts` 391–395) — **risk** (see Risks); implementation should preserve reused built content the same way sync preserves narrative when `built` is true, and re-run swap only if company name changed. |
| AI on page view | None. Identify/reuse only in worker job (same as today’s identify). |

---

## 8. Sections the plan omitted

### 8a. Files and functions affected

| File / function | Becomes |
|---|---|
| `src/lib/application-jobs/process.ts` — `HIRING_TEAM_IDENTIFY` case | After `syncApplicationHiringTeam`, call reuse helper; **no** cheat sheet / outreach enqueue |
| **New** `src/lib/hiring-team/reuse.ts` | `listLibraryPersonas`, `matchLibraryPersona` (uncertain rules), `applyPersonaReuseWithCompanySwap`, provenance write |
| `src/lib/hiring-team/identify.ts` — `rolesDescribeSamePerson`, `roleFunctionFamily` | Reused by matcher; may export a thin `asIdentifiedRoleFromPersona` adapter |
| `src/lib/hiring-team/build.ts` — `isHiringTeamPersonaBuilt`, `hiringTeamInvolvement`, `personaFields`/`profilePayload` patterns | Rebuild clears `reuse`; sync interaction with already-reused built rows documented/tested |
| `src/lib/hiring-team/ai.ts` or small new `relabel.ts` | Optional structured relabel via `getConsultationReplyAiProvider` |
| `src/lib/prompt-content/*` | Relabel system instructions only if model swap ships (exact text in 8b) |
| `src/lib/product-config` / `ApplicationWorkspace.tsx` | **No reuse badge** — verify no “Reused” copy is added |
| `src/lib/application/tracker.ts`, `step-progress.ts` | No rule change; built count rises when reuse marks Direct roles built |
| Outreach / cheat sheet / contact-profile / consultation | **No structural change** required if reused row looks like a normal built Persona (see 8d) |
| Tests under `src/lib/hiring-team/*.test.ts`, step-progress | New cases listed in TESTS |

### 8b. Prompt text

**Identification / synthesis:** none required for reuse matching or copy.

**If model name-swap ships**, add e.g. `PERSONA_REUSE_COMPANY_RELABEL_SYSTEM_INSTRUCTIONS` (new file under `src/lib/prompt-content/`) with exact text:

```
You adapt one Hiring Team general persona from a previous employer to a new employer for the same role.

Replace references to the previous company (and only those references) with the new company name provided in the payload. Do not change role responsibilities, pressures, needs, concerns, talking points, interview stage, or evaluation criteria except where a company or product name must be substituted.

Do not invent new facts. Do not omit fields. Do not add a preface about reuse. Return JSON with the same narrative and column fields you were given.
```

Version constant e.g. `PERSONA_REUSE_RELABEL_PROMPT_VERSION = "1"`.  
If deterministic-only were chosen instead: **none**.

### 8c. Schema changes

**None required.** Provenance in `profileJson.reuse` (JSON). Safe on existing DB: absent key means not reused; no migration; no backfill.

### 8d. Every reader of general Persona / profileJson

| Reader | Path | Change for reuse? | Exposes reuse to seeker? |
|---|---|---|---|
| Step color | `tracker.ts` 155–162; `step-progress.ts` `hiringTeamAllBuilt` 111–116 | No — counts built Direct | No |
| ApplicationWorkspace UI | `ApplicationWorkspace.tsx` narrative display / build buttons | No badge; Build hidden when built (existing) | Must **not** add reuse label |
| Outreach gate | `isHiringTeamPersonaBuilt` | No | No |
| Outreach generation | `generation/context.ts` ~350–417 stringifies `profileJson` when built | No code change; content is swapped copy | No (unless old company left in text — swap must prevent) |
| Cheat sheet | `application-summary/service.ts` `personaNarrative` 168–193 | No auto-enqueue on reuse (PO). When seeker later generates summary, reads narrative like any built persona | No |
| Person-level layer | `contact-profile/service.ts` 229–239 passes `role.profileJson.narrative` as `roleNarrative` when built | **Builds correctly on reused general persona** — same shape; runs only when seeker/contact profile job runs on **this** campaign’s contact | No |
| Harper coach | `consultation/hiring-team-context.ts` `generalPersona` 47–78 | No | No |

**Confirm:** person-level layer and cheat sheet are **not** copied by reuse; they build later on this application’s contacts/summary jobs using the reused general persona as role context when present.  
**Confirm:** no reader should surface `profileJson.reuse` in UI copy.

---

## 9. Step color

Existing rule: Direct-only counts (`tracker.ts` 155–162); done when `hiringTeamBuiltCount === hiringTeamRoleCount` and count > 0 (`hiringTeamAllBuilt` `step-progress.ts` 111–116).

After reuse marks every Direct shell built (`setupStatus`/`narrative` as built), **Personas and Interviewers is green** without seeker Build clicks. If any Direct shell does not reuse and stays unbuilt → yellow (`in_progress`). Indirect reuse does not affect the color.

---

## TESTS (to add in implementation — not written or run in this report)

1. **Match across companies:** Built HM on App A (company X); identify App B (company Y) with HM shell → B’s HM Persona id ≠ A’s; narrative present; employer tokens are Y not X.
2. **Non-match across job descriptions:** Library “RevOps” vs shell “Customer Success” → no reuse; shell `NOT_STARTED`.
3. **Uncertain = no reuse:** Two high-confidence library Recruiters with same key and identical timestamps → shell unbuilt.
4. **Involvement:** Direct library never applied to Indirect shell (and reverse).
5. **Earlier company name never appears** in reused `definition` / narrative texts / messaging fields after swap (fixture with multiple surface forms).
6. **Name swap changes only company references:** structural equality of narrative arrays; non-company sentences unchanged (model or deterministic validator).
7. **People never carry:** App B contact count 0 after identify+reuse.
8. **Person-level layers never carry:** no `individualProfileJson` copied.
9. **Cheat sheets never carry / not enqueued:** after reuse, no new `APPLICATION_SUMMARY` (or section) job from the identify path; `process.ts` identify case does not call `enqueueCheatSheetSectionsForPersona`.
10. **Outreach not enqueued** by reuse (no `OUTREACH` job from identify path).
11. **Person-level layer builds on reused general persona:** `CONTACT_PROFILE` with `chosenPersonaId` pointing at reused role succeeds and receives `roleNarrative` from copied narrative.
12. **Copy independence:** edit/rebuild App B persona does not change App A row; rebuild A does not change B.
13. **Idempotent retry:** second `HIRING_TEAM_IDENTIFY` does not create duplicate Personas for the same roleKey; reuse does not double-create.
14. **No reuse indication in UI:** workspace render/copy has no “Reused” / source-company badge strings for hiring-team cards.
15. **Step color:** all Direct reused → `resolveApplicationStepState("hiring-team") === "done"`; one Direct unbuilt → `in_progress`.

---

## Risks and unknowns

1. **Job-specific substance after name-only swap** — PO-accepted; reused personas will not match a new posting’s duties. Risk: misleading outreach/cheat sheet/Harper coaching until seeker rebuilds.
2. **`rolesDescribeSamePerson` false positives** (Jaccard / shared titles / HM always matches) — mitigate with involvement + uncertain rules; residual wrong matches possible.
3. **False negatives** outside the four `ROLE_FAMILIES` — seeker rebuilds manually.
4. **Sync marks built personas stale on re-identify** (`build.ts` 391–395) — reused built rows would get `staleAt` on a later IDENTIFY; product may need to treat reuse like “built” preservation without forcing rebuild UX, or accept stale badge (stale is not “Reused” but still seeker-visible status). **Unknown without UX check of stale copy** in `ApplicationWorkspace` / `hiringTeamConfig.staleReason`.
5. **Exact cost ratio** of relabel vs full build — model IDs are environment-configured, not in repo.
6. **Alias coverage** for company short names — research free text may invent forms not in `Company.name` / `companyName`.
7. **`Persona.seniority`** often unset on hiring-team builds — cannot use it for matching today.

---

*End of report. No code, configuration, schema, prompts, tests, or data were changed beyond saving this prompt/report document.*
