# Harper Batch D1 — role-agnostic prompts

**Branch:** `checkpoint/harper-prep-hub`  
**Docs commit (STEP 0):** `0145153`  
**D1 commit:** `5b593705969a7f531cc75185ba5501453f0e84f8` (`5b59370`)  
**Remote:** `https://github.com/emaron01/aimed-jobseek.git`

## 1. STEP 0 results

| Check | Result |
| --- | --- |
| Branch / HEAD | `checkpoint/harper-prep-hub` at `4e4e509` before docs commit |
| Unexpected modified files | None (only expected untracked plan docs) |
| D0 completeness (`04318d0`) | `refreshConsultationOffer`, `detectInterviewNoteGap`, `consultationOfferJson` writes, and `consultationOffer` config string gone; `harper-batch-d0.test.ts` present |
| `npm test` | **1914 passed**, 257 files |
| `npm run build` | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | 0 errors; 2 pre-existing warnings in `scripts/step0-assess-hiring-team-drafts.ts` |

**Docs-only commit:** `0145153` — added `harper-batch-d-methodology-plan.md`, `harper-batch-d-methodology-plan-report.md`, `harper-batch-d1-role-agnostic.md`, `merge-checkpoint-harper-prep-hub-batch-c-to-main.md`. Pushed to `checkpoint/harper-prep-hub`.

No `git reset --hard`, checkout discard, clean, stash drop, or force-push was used.

## 2. Prompt changes (PO wording)

### Coach — scope line (`consultation.ts` **16**)

**Before:** *(absent)*  
**After:**

```text
Scope: you coach for any role, in any industry, at any career stage. Never introduce methods, tools, frameworks, or metrics from any profession unless they appear in the supplied Personal Profile or job sources.
```

### Coach — likelyToValue example (`consultation.ts` **40**)

**Before:** `for example "when you talk about your forecast process with Erik, lead with how you ran MEDDPICC deal reviews, because that is how he has built teams"`  
**After:** `for example "when you talk with Jordan about how you trained new team members, lead with the onboarding checklist you built, because that is how they have built their teams"`

### Extract (`consultation.ts` **65**, **70**)

**Before:** `which MEDDIC elements did I inspect` → **After:** `which steps did I take`  
**Before:** `I have used forecasting` → **After:** `I have done that work`

### Contact individual profile (`contact-individual-profile.ts` **10**)

**Before:** `"Erik is big on MEDDPICC: he implemented it at two companies and led enterprise sales teams on it."`  
**After:** `"Jordan is big on hands-on training: they built the onboarding program at two employers and coached every new lead through it."`

### Company research rules 9–10 (`company-research.ts` **18–19**)

**Before:**

```text
9. Do not estimate average order value or deal size. Leave estimatedAov null and aovReasoning null.
10. Hiring and growth signals go in hiringSignals. Do not put them in buyingSignals. buyingSignals must be an empty array.
```

**After:**

```text
9. This research is for a job seeker, not a sales pursuit. Leave estimatedAov and aovReasoning null.
10. Hiring and growth signals go in hiringSignals. Leave buyingSignals as an empty array (kept only for compatibility).
```

### Cheat Sheet + interview guide role scope

**Added** (`application-summary.ts` **5**, `interview-guide.ts` **16**):

```text
Role scope: write for this job's actual role and industry. Never introduce methods, tools, frameworks, or metrics that are not in the supplied sources.
```

## 3. Classifier change

`cheatSheetSectionKind` in `people.ts` **61**: removed `executive sales sponsor` from the EXECUTIVE regex. `"Executive Sponsor"` matches without requiring `"sales"`.

## 4. Prompt version bumps

| Constant | Old → New | Triggers on next seeker action (not page view) |
| --- | --- | --- |
| `CONSULTATION_PROMPT_VERSION` | 27 → **28** | Next Harper plan/extract/polish that stores session/statement `promptVersion`; does not auto-regen |
| `APPLICATION_SUMMARY_PROMPT_VERSION` | 11 → **12** | Changes `cheatSheetPersonSectionInputHash`; next person-section enqueue/regen when inputs differ |
| `INTERVIEW_GUIDE_PROMPT_VERSION` | 5 → **6** | Next guide generate when seeker requests/enqueues a guide |
| `CONTACT_PROFILE_PROMPT_VERSION` | 3 → **4** | Next individual interview-profile synthesis on paste/rebuild |
| `RESEARCH_PROMPT_VERSION` | 4 → **5** | Next company research run when freshness/enqueue triggers research |

Nothing regenerates on page view (asserted in D1 tests + existing no-AI-on-view suite).

## 5. Files changed

- `src/lib/prompt-content/consultation.ts`
- `src/lib/prompt-content/contact-individual-profile.ts`
- `src/lib/prompt-content/company-research.ts`
- `src/lib/prompt-content/application-summary.ts`
- `src/lib/prompt-content/interview-guide.ts`
- `src/lib/application-summary/people.ts`
- `src/lib/consultation/contract.ts`
- `src/lib/application-summary/contract.ts`
- `src/lib/interview/contract.ts`
- `src/lib/contact-profile/contract.ts`
- `src/lib/research/config.ts`
- `src/lib/consultation/harper-batch-d1.test.ts` **(added)**
- Version assertion updates in existing tests (listed below)
- `docs/prompts/harper-batch-d1-role-agnostic-report.md` (this report)

## 6. Tests

**Added:** `harper-batch-d1.test.ts` — exact new prompt text; absence of MEDDIC/MEDDPICC/forecast process/used forecasting/Erik examples; no sales-only terms in Harper-related prompts; Executive Sponsor classifier; no page-view regen.

**Changed existing tests (version / prompt text only):**

| File | Why |
| --- | --- |
| `consultation.test.ts` | Version 28; extract incomplete-claim text |
| `harper-context-finish.test.ts` | Version 28 |
| `cheat-sheet.test.ts` | Version 12 |
| `interviewer-synthesis.test.ts` | Version 4 |
| `company-briefing-page.test.ts` | Version 5 + describe/message string |

| Check | Result |
| --- | --- |
| `npm test` | **1920 passed**, 258 files |
| `npm run build` | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | 0 errors; same 2 pre-existing warnings |

## 7. Commits / branch

- STEP 0 docs: `0145153`
- D1 implement: `5b593705969a7f531cc75185ba5501453f0e84f8`
- Pushed: `checkpoint/harper-prep-hub` (not main)

## 8. Safety confirmation

No git command discarded work. Scope limited to STEP 0 docs backup + Batch D1 role-agnostic prompt/classifier/version bumps and tests. No methodology tags, answer parts, career stage, role-expertise, or learnings changes.
