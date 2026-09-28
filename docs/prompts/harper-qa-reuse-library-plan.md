# Prompt: Harper Q&A reuse library (plan only)

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PLAN ONLY. Do not change any code, configuration, schema, prompts, or data. Write the plan and stop. Coding starts only after the product owner approves it.

GOAL
A job seeker may work 100+ applications a month. Today every application runs Harper from scratch: a new plan and assessment, new questions, and new extract and polish calls, even for gaps the seeker already closed on an earlier application (for example, developing managers or forecast discipline). Harper's Q&A results must be reusable across the same seeker's applications. This decides whether the product is affordable.

PLAN FOR
1. What is reusable across applications, and what is not. Consider the seeker's answers, extracted facts and stories, approved interview answers and resume bullets, confirmed gaps and their talk tracks, and gap decisions. Company-specific items (why-this-company, interviewer prep, the cheat sheet) are not reusable.
2. A Harper library per seeker: where approved results are stored, and how each is tagged to the requirement or competency it proves.
3. Matching: when a new application is planned, how Harper recognizes that a requirement is already covered by a library item, so she asks no question and runs no extract or polish for it. Prefer matching inside the plan call Harper already makes, rather than adding calls.
4. Tailoring: when a reused statement fits as is, and when it needs a light rewrite for the new job's language, and which model does that rewrite. Estimate the cost of each path.
5. Seeker control: how reused results appear on the new application, and how the seeker approves, edits, or regenerates them. Nothing reused is presented as new work without the seeker seeing it.
6. Downstream: the resume, cover letter, and cheat sheet use library results for the new application.
7. The plan call itself: whether, with the library in place, the per-application assessment can run on the cheaper model, or be reduced, and what quality risk that carries.
8. Cost: per-application AI calls and estimated cost for a seeker's first application and for a typical later application, before and after, using the production model rates.

THE PLAN MUST INCLUDE
- Files and functions affected, and what each becomes.
- Prompt text to add or change.
- Schema changes, and how they are safe on existing data.
- Risks, including statements tailored too closely to one company and stale results, and the tests that will prove it.
- A proposed split into coding passes and the order of work.

---

# Plan: Harper Q&A reuse library (awaiting approval)

**Repo:** aimed-jobseek (`https://github.com/emaron01/aimed-jobseek.git`) · **Branch:** main  
**Status:** PLAN ONLY — no product code, schema, or prompt-content changes until approved.

---

## Verdict

Reuse is the right lever. Today Harper’s **session, assessments, and statements are campaign-scoped**, so every application re-plans and re-extracts/polishes gaps the seeker already closed. The Personal Profile already shares **facts and ProfileStory** across applications on the same product; what is missing is a **seeker library of approved gap closures** that the plan call can match, so covered requirements ask no question and spend no extract/polish.

---

## 1. What is reusable vs not

### Reusable (across applications on the same Personal Profile / product)

| Artifact | Today | Library role |
|---|---|---|
| Seeker verbatim answers that closed a gap | `ConsultationTurn.body` (campaign) | Keep as source text; prefer approved polished forms for reuse |
| Extracted facts / stories (confirmed) | `Product.profileJson`, `ProfileStory` | Already shared; library entries **link** to them |
| Approved interview answers | `ConsultationStatement` + `ProfileStory.interviewAnswer` | Library stores the approved text + provenance |
| Approved resume bullets | Same + `ProfileStory.resumeBullet` | Same |
| Gap decision `evidence` with talk track | `analysisJson.gapDecision` + INTERVIEW_ANSWER | Library entry: covered requirement + talk track (+ optional bullet) |
| Gap decision `no_evidence` with honest talk track | Assessment NONE + statement without bullet | Library entry: confirmed gap + talk track; no inventing experience |

### Not reusable (always per application)

| Artifact | Why |
|---|---|
| Why-this-company | Company-specific motivation (`Campaign.whyThisCompany`) |
| Interviewer prep (`person-prep:*`) | Person- and room-specific |
| Cheat sheet sections | Application + interviewer context |
| Employer research, fit, hiring-team personas | Application/employer-specific |
| Plan briefing prose, whoCaresNote, closingNote | Must reflect **this** job and Hiring Team |
| `incomplete` follow-ups mid-thread | Transient; not a closed result |

### Grey area (reuse with care)

- **PARTIAL** closures that only added a missing piece: reusable if the library text still covers the new job’s full ask; otherwise ask only for the delta.
- Statements that name a **prior employer’s product language** heavily: reusable as evidence, but may need a light tailor (see §4).

---

## 2. Harper library per seeker

### Where it lives

**Scope:** `organizationId` + `productId` (same as `ProfileStory` / Personal Profile).

**New model (proposed):** `HarperLibraryEntry`

| Field | Purpose |
|---|---|
| `id` | Stable id |
| `organizationId`, `productId` | Seeker bank |
| `requirementText` | Canonical wording of what this proves |
| `requirementKind` | REQUIRED / OUTCOME / COMPETENCY / PREFERRED (not why-this-company) |
| `meaningKey` | Normalized assist via existing `sameRequirementMeaning` / `contentTokens` |
| `gapDecision` | `evidence` \| `no_evidence` |
| `interviewAnswer` | Approved talk track (required) |
| `resumeBullet` | Approved bullet or null (null for confirmed gaps) |
| `profileStoryId` | Optional FK to `ProfileStory` |
| `supportingFactIds` | Profile fact ids (structured only) |
| `sourceCampaignId`, `sourceTurnId` | Provenance |
| `approvedAt`, `updatedAt` | Freshness |
| `retiredAt` | Optional seeker/system retire |

**Write path:** when the seeker **Approves** an INTERVIEW_ANSWER (and RESUME_BULLET when present) on a standing gap that is not why-this-company / person-prep, upsert a library entry.

**Do not** auto-promote DRAFT statements. Approval is the gate.

### Tagging

1. Human requirement text from the assessment that was closed.  
2. Kind (required / outcome / competency / preferred).  
3. Meaning fingerprint (`sameRequirementMeaning` in `assess.ts`) for server prefilter.  
4. Optional competencyLinks from stories as secondary tags.

Plan payload gets a compact `harperLibrary` list (id, requirementText, kind, gapDecision, short previews).

---

## 3. Matching (inside the existing plan call)

**One terra plan call** already assesses every target. Extend it: Harper sets `libraryMatch` per target. No separate matching AI call.

**Coach rules:** For each target except why-this-company and interviewer prep, if a library entry proves the same underlying requirement, set `libraryMatch: { entryId, fit: "exact" | "needs_tailor" }` and emit **no question**. Prefer library over re-asking when wording differs but meaning matches.

**Contract:** add nullable `libraryMatch` on plan assessments.

**Server verify:** drop unknown entry ids; deny why-this-company / person-prep; materialize assessment STRONG/NONE from `gapDecision`; skip question turns; apply DRAFT statements (exact) or queue tailor (needs_tailor).

Covered gaps: **zero extract, zero polish**.

---

## 4. Tailoring

| Fit | Behavior | Model | Est. $ / entry |
|---|---|---|---|
| `exact` | Copy approved text into this campaign as DRAFT; seeker Approves here | None | $0 |
| `needs_tailor` | Luna rewrite for this job’s language; keep facts; no inventing | CONSULTATION_REPLY_AI (luna) | ~$0.002–0.005 |
| No match | Extract + polish as today | luna ×2 | ~$0.005–0.01 (+ retries) |

Do **not** use terra for tailor.

---

## 5. Seeker control

1. Reused gaps show as closed/confirmed with a clear **“Reused from your library”** label (not as fresh Harper prose).  
2. Statements stay **DRAFT** until Approve on **this** campaign.  
3. Per item: Approve · Edit · Regenerate (drop match; ask again) · Unlink (re-open gap; keep library).  
4. Optional “Also update library” on edit — defer to a later pass (default off in v1).

---

## 6. Downstream

After Approve on the new campaign, existing paths already feed resume, cover letter, and cheat sheet from APPROVED `ConsultationStatement` and `ProfileStory`. Apply-from-library must create statements under **this** session’s target keys. No separate cheat-sheet library path in v1.

---

## 7. Plan call model

| Option | v1 recommendation |
|---|---|
| Keep plan on **terra** | **Yes** — matching + assessment is high-leverage; bad matches create silent holes |
| Move plan to **luna** | Only after measured match precision/recall |
| Shrink questions when library covers most | Natural outcome of matching |
| Skip plan entirely when fully covered | Not in v1 (still need briefing + why-this-company) |

---

## 8. Cost (seed rates)

**Rates:** terra $2 / $12 per 1M in/out · luna $0.20 / $1.20 per 1M in/out.

**Assumptions:** ~6 standing gaps on first app; later app ~4 library matches (2 exact, 2 tailor) + 2 new + why-this-company.

| | First app | Later today | Later with library |
|---|---|---|---|
| Plan (terra) | 1 | 1 | 1 |
| Extract + polish (luna) | ~12 | ~12 | ~4–6 |
| Tailor (luna) | 0 | 0 | ~2 |
| **Happy-path Harper calls** | **~13** | **~13** | **~6–8** |
| **Harper $ (order of magnitude)** | **~$0.15** | **~$0.15** | **~$0.13** |

At **100 apps/month**, ~70% reuse cuts on the order of **half the luna extract/polish volume** and removes the retry surface for skipped gaps. Full-app cost (research, personas, assets) is unchanged; Harper is the repeatable middle.

---

## Files and functions

| Area | Files | Becomes |
|---|---|---|
| Schema | `prisma/schema.prisma` | `HarperLibraryEntry` |
| Library | new `src/lib/consultation/library.ts` | list / upsert / getByIds |
| Approve | `service.ts` `approveConsultationStatement` | Upsert library after approve |
| Plan payload | `prompt.ts` | `harperLibrary` in coach messages |
| Contract | `contract.ts` | `libraryMatch` |
| Plan apply | `service.ts` `planAndStoreRound` | Verify matches; skip questions; DRAFT apply |
| Tailor | `ai.ts` + new prompt | Luna rewrite |
| Prompt content | `prompt-content/consultation.ts` | Match + tailor rules; bump version |
| UI | Standing / Thread / Section | Library label + regenerate/unlink |

---

## Prompt drafts

**Coach:** “`harperLibrary` lists approved closures from earlier applications. For each job target except why-this-company and interviewer prep, if an entry proves the same underlying requirement, set `libraryMatch` and do not ask. Prefer the library when wording differs but meaning matches. Never put library ids in prose.”

**Tailor:** “Rewrite for this job’s language. Keep every fact, number, and employer. Do not invent. Do not treat the previous employer as this company. Null resumeBullet stays null.”

---

## Schema safety

Additive table only; no required backfill. Existing campaigns unchanged. Nullable `profileStoryId` with `ON DELETE SET NULL`. Optional historical backfill = separate pass.

---

## Risks and tests

| Risk | Mitigation | Tests |
|---|---|---|
| Over-match | Validate entry ids; UI + Regenerate | Distinct requirements must not match |
| Under-match | Semantic coach rules | Same meaning, different wording matches |
| Prior-company language | `needs_tailor` rules | Tailor strips wrong company framing |
| Stale entries | `retiredAt`; Unlink | Retired never matches |
| why-this-company / prep in library | Deny on write + match | Unit tests |
| Silent auto-approve | Always DRAFT on apply | Status stays DRAFT until Approve |

---

## Coding passes

| Pass | Scope |
|---|---|
| **C1** | Schema + upsert on Approve + list (no plan behavior yet) |
| **C2** | Plan match + skip questions + exact DRAFT apply + UI label |
| **C3** | `needs_tailor` + Regenerate/Unlink |
| **C4** | Optional backfill + metrics; luna plan only if metrics support it |

---

## Open decisions for the product owner

1. Library scope: **product** (recommended) vs across all products for the user?  
2. Always upsert on Approve, or opt-in checkbox? (Recommend always.)  
3. “Also update library” on edit in C3 or later?  
4. Backfill historical approvals?  
5. Exact seeker-facing label copy.

---

*End of plan. Coding starts only after approval. No product code was changed.*
