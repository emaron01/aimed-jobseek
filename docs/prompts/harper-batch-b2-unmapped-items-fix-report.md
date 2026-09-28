# Harper B2 unmapped-items fix — Report

**Repo:** `C:\Repos\aimed-jobseek` (`origin` → `https://github.com/emaron01/aimed-jobseek.git`). Aimed Outreach was not read or touched.  
**Prompt saved:** `docs/prompts/harper-batch-b2-unmapped-items-fix.md`  
**Context:** `docs/prompts/harper-batch-b2-standing-inline-qa-report.md` left `cheatSheet:*` and dropped requirement keys unmapped and unrendered.  
**Date:** 2026-09-28

---

## 1. STEP 1 findings

### 1a. `cheatSheet:{itemId}` → interviewer (contact)

| Step | Location | Detail |
|---|---|---|
| Answer save | `src/lib/application-summary/service.ts` **1014** | `targetKey = \`cheatSheet:${input.itemId}\`` on CONSULTANT + SEEKER turns |
| Item id assignment | `src/lib/application-summary/coach.ts` **70–118** (`assignCoachItemIds`) | Person coach items get ids `${person.sectionKey}:likely:N` (also `:flagAnswers`, `:drill`, `:gap`) |
| Section key for people | `src/lib/application-summary/people.ts` **123** | `sectionKey: \`contact:${contact.contactId}\`` — current Cheat Sheet people are **contact-only** (no `role:` sections in production builder; `cheat-sheet.test.ts` asserts that) |
| Full key example | — | `cheatSheet:contact:{contactId}:likely:1` |
| Contact extraction | `src/lib/consultation/harper-layout.ts` **33–42** (`contactIdFromCheatSheetTarget`) | Strip `cheatSheet:`, require `contact:`, take the next segment as `contactId` |

**Can every cheatSheet item be tied to a contact?**

| Item id shape | Tied to contact? |
|---|---|
| `contact:{contactId}:likely\|flagAnswers\|drill\|gap:N` | **Yes** |
| `overview:gap:N` (`coach.ts` **89–92**) | **No** — overview, not a person section |
| Legacy `role:{roleId}:…` (older guidance / tests) | **No** — no contact id on the key |

### 1b. Other ways to produce an unmapped key

| Case | How it arises | File / line | Placeable? |
|---|---|---|---|
| Requirement key dropped from standing after reassess / `isStandingRequirement` filter | Assessment still asked under `required:` / `outcome:` / `competency:` / `preferred:` / `mission:` but filtered out of standing UI (`ConsultationSection` standing filter ~**225–238**; `isStandingRequirement` in `assess.ts` **626–632**) | Partition now treats requirement-like keys with content as **orphaned requirement topics** | **Yes** — Where you stand, label from assessment text (`requirementLabels` from all session assessments) or question text; **no rating** |
| Assessment row deleted but turns remain | Same requirement-like `targetKey` on turns; label falls back to question body | Same | **Yes** (label = question text) |
| `why-this-company` / `chronology` / `role-expertise:*` | Already dedicated topics (Batch B2) | `harper-layout.ts` partition | **Yes** |
| `person-prep:{contactId}` | Interviewer section | `buildHarperQaLayout` | **Yes** |
| `cheatSheet:overview:gap:*` | Overview coach items | `coach.ts` **89–92** | **STOP** — not requirement / dedicated / interviewer |
| `cheatSheet:role:*` | Legacy role section coach items | Historical `sectionKey` | **STOP** |
| `null` / empty `targetKey` with seeker answers | Synthetic qa-view hosts (`qa-view.ts` **349–364**) or bad data | — | **STOP** |
| Unknown prefixes (not requirement-like, not dedicated, not contact cheatSheet) | Prompt-version renames or ad-hoc keys | — | **STOP** if they still need render |

---

## 2. What changed (file + line)

| Change | Where |
|---|---|
| `CHEAT_SHEET_TARGET_PREFIX` | `src/lib/consultation/contract.ts` **10–11** |
| `contactIdFromCheatSheetTarget`, `isRequirementLikeTargetKey`, `harperItemNeedsRender` | `src/lib/consultation/harper-layout.ts` **28–56** |
| `buildHarperQaLayout` routes contact-linked cheatSheet into interviewer sections | **129–145** |
| `orphanedRequirementTopics` in partition + labels map | **195–302** |
| `collectRenderedHarperQuestionTurnIds` + `harperContentRenderCoverage` invariant | **305–360** |
| Wire labels, orphaned rows (strength `null`), coverage call | `src/components/ConsultationSection.tsx` **333–380**, standing props **527+** |
| Standing allows `strength: null` (no rating badge) | `src/components/ConsultationStanding.tsx` type + badge render |

---

## 3. Cases stopped for approval (no “Other” section)

These still need render when they have seeker content, but **cannot** be placed under a requirement, dedicated topic, or interviewer without inventing a bucket. Left in `unmapped`; coverage reports them as `missing`. **PO decision required:**

1. **`cheatSheet:overview:gap:{n}`** — overview gaps from `assignCoachItemIds`; no contact. Example: answer saved against an overview coach item → turns with that `targetKey`.
2. **`cheatSheet:role:{roleId}:…`** — legacy role-section coach ids (no longer generated for new people, but old guidance may still exist).
3. **`targetKey: null` (or empty) with seeker answers / open Q** — synthetic hosts or corrupt turns.

Until PO decides, these are **not** rendered (and not hidden behind an “Other” section). Contact-linked cheatSheet and dropped requirement keys **are** rendered.

---

## 4. Every file changed

- `docs/prompts/harper-batch-b2-unmapped-items-fix.md` (prompt)
- `docs/prompts/harper-batch-b2-unmapped-items-fix-report.md` (this report)
- `src/lib/consultation/contract.ts`
- `src/lib/consultation/harper-layout.ts`
- `src/components/ConsultationSection.tsx`
- `src/components/ConsultationStanding.tsx`
- `src/lib/consultation/harper-batch-b2-unmapped.test.ts` (**new**)
- `src/lib/consultation/harper-batch-b2.test.ts` (cheatSheet expectations)
- `src/lib/interview/harper-batch-b1.test.ts` (cheatSheet → interviewer comment/assert)

---

## 5. Tests + suite

### Added
- `harper-batch-b2-unmapped.test.ts` — contact mapping from coach ids; cheatSheet answer in interviewer section; new Cheat Sheet answer path; dropped requirement without rating; render invariant exactly-once; STOP cases unmapped; no paid call / enqueue on render.

### Changed existing (reasons)
| File | Why |
|---|---|
| `harper-batch-b2.test.ts` | Contact-linked cheatSheet now goes to interviewer; overview cheatSheet remains the STOP unmapped example |
| `harper-batch-b1.test.ts` | Assert `contactIdFromCheatSheetTarget` instead of “appears in general” |

### Full suite (real Postgres)

```
npm test

Test Files  251 passed (251)
     Tests  1865 passed (1865)
```

TEST Postgres at `127.0.0.1:5435` (`aimedjobseek_test`) was already up; suite includes real-Postgres tests. No new failures.

---

## 6. Confirmation — nothing outside this fix

Stage, Outreach, Cheat Sheet page UI, Harper prompts/planning/learnings, Phase 1 gate, serialization, and paid-call paths were **not** modified. Only Harper layout/partition/standing wiring for previously unmapped items, plus tests/docs.
