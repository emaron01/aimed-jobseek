# Harper Batch B1 — Stage timeline + Outreach thank-you — COMPLETE REPORT

**Repo confirmed:** `C:/Repos/aimed-jobseek` → `origin` `https://github.com/emaron01/aimed-jobseek.git`. Aimed Outreach was not read or touched.  
**Saved prompt:** `docs/prompts/harper-batch-b1-stage-timeline-outreach.md`  
**Approved plan:** Batch B1 of `docs/prompts/harper-prep-hub-plan-report.md` (PO decisions in the B1 prompt override the plan where they differ).  
**Mode:** Implementation complete. No schema changes, no migrations, no data repair.

This document is the full STEP 1 research **and** STEP 2 / REPORT deliverable (all eight report items).

---

# STEP 1 — Research (file + line), before / as basis for changes

## STEP 1.1 — Note fields on Stage

### A. Newly gained information (“Add to cheat sheet”)

| Aspect | Detail |
|--------|--------|
| **UI label** | `interviewConfig.labels.gainedInformation` = `"Newly gained information"` (`src/lib/product-config/interview.ts` **18**); submit `"Add to cheat sheet"` (**21**); help (**19–20**) |
| **Where shown after B1** | Inside Post Interview Notes `<details>` on Stage list (`InterviewStagesSection.tsx` **166–201**). Before B1: `InterviewStagePanel.tsx` gained-information block (removed from panel). |
| **Action** | `addCheatSheetInterviewNoteAction` (`src/app/actions/interview.ts` **209–235**) → `addCheatSheetInterviewNote` |
| **Storage** | `CampaignContact.cheatSheetNotesJson` — append via `appendCheatSheetNote`, then `prisma.campaignContact.update` (`src/lib/application-summary/service.ts` **878–917**) |
| **Read — Harper coach person payload** | `recordedNotes` from `parseCheatSheetNotes(membership.cheatSheetNotesJson)` (`src/lib/consultation/hiring-team-context.ts` **243–249**) — fed into each hiring-team person on coach plan/prep |
| **Read — Cheat Sheet** | `notesByContactId` / person body notes list (`getApplicationSummaryView` path; display in `CheatSheetPersonBody`) |
| **Read — fingerprints** | Cheat-sheet person section sources/hash include contact notes assembly in summary service (notes are part of person section inputs when present) |
| **Triggers on save** | (1) `enqueueCheatSheetPersonSection` (**919–924**); (2) `enqueueApplicationJob` type `CONSULTATION`, payload `{ operation: "reassess" }` (**925–932**) |
| **Reaches Harper for future interviews?** | **Yes.** Notes become `recordedNotes` on that interviewer in `loadCoachHiringTeam` / person payload (**243–249**), used whenever Harper plans or does person_prep for that campaign. Reassess also re-runs standing/plan with campaign evidence. |

### B. Notes before

| Aspect | Detail |
|--------|--------|
| **UI label** | `interviewConfig.labels.notesBefore` = `"Notes before"` (`interview.ts` **27–28**) |
| **Where shown** | (1) Create-stage form (`InterviewStagesSection.tsx` **110–113**); (2) Post Interview Notes update form (**216–223**) |
| **Action** | Create: `createInterviewStageAction` → `createInterviewStage` (`stages.ts` **~84–116**, writes `notesBefore`). Update: `updateInterviewStageAction` (`interview.ts` **92–145**) → `updateInterviewStage` (`stages.ts` **129–212**) |
| **Storage** | `InterviewStage.notesBefore` (Prisma `InterviewStage`, written at `stages.ts` **184**) |
| **Read — Harper flat coach evidence** | `interviewNotesEvidence` builds FACT id `interview-notes:{stageId}:before` (`consultation/service.ts` **800–812**); merged in `seekerStatedFactsForCoach` (**827–853**, stages loaded **982**) for every coach plan/reassess |
| **Read — Harper person payload** | Per-stage on contacts who interviewed: `notesBefore: trimmed(stage.notesBefore)` (`hiring-team-context.ts` **204**, **221**) |
| **Read — Cheat Sheet sources** | Source id ``interview:${stage.id}:notesBefore`` (`application-summary/service.ts` **448–449**) |
| **Read — fingerprints** | Person-section input hash includes `stage.notesBefore` / `notesAfter` (**381–382**) |
| **Triggers on save (update)** | If `notesTextChanged` (`stages.ts` **173–177**, **199–210**): `enqueueInterviewerCheatSheetSection` for each stage interviewer. Action (`interview.ts` **133–139**): if `notesTextChanged`, enqueue `CONSULTATION` `{ operation: "reassess" }` |
| **Reaches Harper for future interviews?** | **Yes.** Always included as campaign-flat FACT evidence for planning (`seekerStatedFactsForCoach`), and on that interviewer’s `interviewStages[]` entry when they were on the stage. |

### C. Notes after

| Aspect | Detail |
|--------|--------|
| **UI label** | `interviewConfig.labels.notesAfter` = `"Notes after"` (`interview.ts` **29–30**) |
| **Where shown** | Post Interview Notes update form (`InterviewStagesSection.tsx` **225–232**) |
| **Action / storage** | Same update path as notes before → `InterviewStage.notesAfter` (`stages.ts` **185**) |
| **Read — Harper flat + person** | Same as notes before: `interview-notes:{id}:after` (`service.ts` **814–821**); person payload **222** |
| **Read — Cheat Sheet** | ``interview:${stage.id}:notesAfter`` (`application-summary/service.ts` **454–455**) |
| **Read — thank-you generation** | `resolveInterviewThankYouNotes` (`application-assets/display.ts` **165+**) prefers stage `notesAfter` for thank-you/check-in body context |
| **Extra trigger** | If form has `notesAfter` and `notesTextChanged`: `refreshConsultationOffer` (`interview.ts` **126–131**) → may set `consultationOfferJson` via `detectInterviewNoteGap` (`stages.ts` **398–435**). Plus same cheat-sheet + reassess as notes before. |
| **Reaches Harper for future interviews?** | **Yes** — same channels as notes before. (Gap *offer* CTA was Stage-only UI; offer JSON may still exist on the stage row but B1 removed the Stage CTA that started consultation from it.) |

**Plain summary:** All three note types reach Harper for future interviews (flat evidence and/or person `recordedNotes` / `interviewStages`). Save still enqueues cheat-sheet section and/or CONSULTATION reassess as before. B1 did **not** change what these fields feed — only where the forms sit on Stage.

---

## STEP 1.2 — Interview builds (persona / contact profile / prep)

| Control | UI | Action / service | Starts persona build (`HIRING_TEAM_BUILD`)? | Starts contact profile (`CONTACT_PROFILE` / LinkedIn paste)? | Other jobs |
|---------|-----|------------------|---------------------------------------------|--------------------------------------------------------------|------------|
| **Use this interviewer** | `InterviewStagePanel.tsx` **66–105** | `assignExistingInterviewerAction` (`interview.ts` **180–207**) → `assignExistingInterviewStageInterviewer` (`stages.ts` **284–335**) | **No** | **No** | **Yes:** `offerPersonPrep` (**322–328**) → CONSULTATION `person_prep` (`person-prep.ts` **75–84**); `enqueueInterviewerCheatSheetSection` (**329–334**) |
| **Add new interviewer** | Panel details **93–151** | `addInterviewInterviewerAction` → `addInterviewStageInterviewer` (`stages.ts` **338–395**) | **No** (unless seeker later builds) | **Yes if paste:** `saveLinkedInPaste` (**366–373**) → CONTACT_PROFILE | `offerPersonPrep` (**380–386**); if no paste, cheat-sheet section (**387–394**) |
| **Add stage** | `InterviewStagesSection.tsx` **74–115** | `createInterviewStageAction` → `createInterviewStage` | **No** | **No** | None for build |
| **Build persona / Generate CS section** (pre-B1 on Stage) | Was inside embedded `CheatSheetPersonBody` on Stage | `buildCheatSheetPersonaAction` / `generateApplicationSummaryAction` | Was **Yes** (build) / SUMMARY | N/A | **Removed from Stage** in B1 (still on Cheat Sheet page) |

**Prep paths that remain if assign were assign-only:** Add new interviewer; Cheat Sheet build/generate; Hiring Team add-person (`offerPersonPrep` callers in `hiring-team.ts`). See REPORT §3 STOP.

---

## STEP 1.3 — Outreach elements that could render on Stage (pre-B1)

**Views:** List = `InterviewStagesSection` on `/campaigns/[id]/interviews`. Detail = `/interviews/[stageId]` = panel only — **never** showed thank-you/check-in/gap (those lived only on the list).

**Gate for thank-you / check-in block (pre-B1):** `canEdit && stage.notesAfter && stage.interviewers[0]`.

| Element | Pre-B1 location | Exact render condition | Reachable? |
|---------|-----------------|------------------------|------------|
| Thank-you clarifying questions form | List, inside notesAfter block | Gate above **and** `thankYouClarifyJson.questions` non-empty, not `skipped`, no non-empty answers | **Yes** when backend stored questions after a prior thank-you attempt with thin notes |
| Thank-you email | List | Gate above | **Yes** |
| Thank-you LinkedIn InMail | List | Gate above | **Yes** |
| Check-in email | List | Gate above | **Yes** |
| Gap consultation CTA | List | `canEdit` **and** `consultationOfferJson.text` | **Yes** when notes-after save ran `refreshConsultationOffer` and found a gap — **Q&A, not outreach** → removed, not moved |
| Detail page outreach | Detail | — | **Never** rendered outreach |

Why PO might see none: empty `notesAfter` or no interviewer assigned → gate fails. Still reachable in production when both are set → **must move**.

---

## STEP 1.4 — Outreach page before B1 (thank-you)

| Capability | Detail |
|------------|--------|
| Route | `src/app/(app)/campaigns/[id]/outreach/page.tsx` → `ApplicationWorkspace` `focus="outreach"` |
| UI | `ApplicationOutreachSection` (`ApplicationOutreachSections.tsx`) |
| Thank-you via generator | Kind `INTERVIEW_THANK_YOU` → EMAIL + purpose THANK_YOU; stage `<select name="interviewStageId">` |
| **skipThankYouQuestions** | Pre-B1: when `thankYouSelected`, generator **always** posted `skipThankYouQuestions=1` — clarifying UI existed only on Stage |
| Stage data passed | Only `id/type/format/scheduledAt` — **no** `notesAfter` / `thankYouClarifyJson` / interviewer (expanded in B1) |

---

# STEP 2 — What was implemented

1. Removed Review open questions (`InterviewStageOpenActions.tsx` — only Post Interview Notes remains).
2. Removed embedded cheat-sheet person prep/answers from Stage (`InterviewStagePanel.tsx` — no `CheatSheetPersonBody`).
3. Removed gap consultation CTA and all Stage thank-you/check-in forms (`InterviewStagesSection.tsx`).
4. Removed Edit chip; interviewer **name** is a text link via `workspaceHarperContactHref` → `/campaigns/{id}/consultation#harper-contact%3A{contactId}` (`InterviewStagePanel.tsx` **44–50**; helper `workspace-links.ts` **35–44**). Id never shown as visible text.
5. Use this interviewer kept; did **not** strip `offerPersonPrep` / cheat-sheet enqueue (STOP — §3). Confirmed no persona/CONTACT_PROFILE on that path.
6. Renamed open-stage button to **Post Interview Notes** (`interview.ts` **23**); opens `#post-interview-notes-{stageId}` with gained information + notes before/after + expected decision + outcome + Save (`InterviewStagesSection.tsx` **166–261**). Same actions/storage as before.
7. Add stage / Use interviewer / Add new interviewer unchanged in behavior (add new still builds as before).
8. Moved reachable outreach to Outreach under same conditions (`ApplicationOutreachSections.tsx` **531–657**); clarify preserved; generator no longer always-skips.
9. Existing `cheatSheet:` ConsultationTurns remain in Harper session (storage unchanged).

---

# REPORT (required items 1–8)

## REPORT 1 — STEP 1 findings

Fully documented above under **STEP 1.1–1.4** (note fields with storage/reads/triggers/Harper reach; build triggers; outreach render conditions; Outreach page + skipThankYouQuestions).

---

## REPORT 2 — Every element removed, changed, or moved (file + line)

| Element | Disposition | File + lines (after B1 unless noted) |
|---------|-------------|--------------------------------------|
| “Review open questions for this interview” | **Removed** | Gone from `InterviewStageOpenActions.tsx` (file now only Post Interview Notes **19–39**) |
| Embedded `CheatSheetPersonBody` / CS answer forms on Stage | **Removed** | `InterviewStagePanel.tsx` — panel ends after add-interviewer (**1–156**); no CheatSheetPersonBody import |
| “Generate this person's Interview cheat sheet…” empty state | **Removed** | Was panel `noCheatSheetSection`; gone |
| Gap consultation CTA | **Removed** | No `startInterviewGapConsultationAction` in `InterviewStagesSection.tsx` |
| Thank-you clarify form | **Moved** | Outreach `ApplicationOutreachSections.tsx` **556–592** (`thank-you-answers-{id}`) |
| Thank-you email | **Moved** | Outreach **595–617** (`thank-you-email-{id}`) |
| Thank-you LinkedIn | **Moved** | Outreach **618–640** (`thank-you-linkedin-{id}`) |
| Check-in | **Moved** | Outreach **641–655** (`check-in-{id}`) |
| Edit contact next to interviewer | **Removed** | No `workspaceContactEditHref` / `editContact` on panel |
| Interviewer name → Harper | **Changed** | `InterviewStagePanel.tsx` **44–50**; `workspaceHarperContactHref` `workspace-links.ts` **35–44** |
| “Add newly gained information here” | **Renamed** | Label `postInterviewNotes` `interview.ts` **23**; button `InterviewStageOpenActions.tsx` **29–37**; form `InterviewStagesSection.tsx` **166–261** |
| Gained-info form location | **Moved within Stage** | From panel → Post Interview Notes details (**176–201**) |
| Notes before/after/outcome/save | **Kept, wrapped** | Same `updateInterviewStageAction` inside details (**203–260**) |
| Stage list loading CS summary | **Removed dependency** | `InterviewStagesSection` no longer calls `getApplicationSummaryView` |
| Stage detail page | **Simplified** | `interviews/[stageId]/page.tsx` — panel only, no summary/CS embed |
| Outreach stage payload | **Expanded** | `ApplicationWorkspace.tsx` interviewStages select includes `notesAfter`, `thankYouClarifyJson`, interviewers; mapped into outreach props |
| Generator always-skip thank-you clarify | **Changed** | Skip only when `pendingGenerate?.skipThankYouQuestions` (`ApplicationOutreachSections.tsx` **933–939**, **1035–1041**), not whenever thank-you kind selected. Regenerate of existing THANK_YOU asset still skips (**1313–1315**) |

---

## REPORT 3 — Stopped for approval

**Item: “Use this interviewer” must only assign and must not start persona/contact-profile build.**

| Check | Result |
|-------|--------|
| Starts `HIRING_TEAM_BUILD` / persona synthesize? | **No** (`stages.ts` **284–335**) |
| Starts `CONTACT_PROFILE` / `saveLinkedInPaste`? | **No** |
| Only assigns today? | **No** — still calls `offerPersonPrep` (**322–328**) and `enqueueInterviewerCheatSheetSection` (**329–334**) |
| If those were stripped, remaining prep paths? | Add new interviewer (`stages.ts` **380–394**); Cheat Sheet `buildCheatSheetPersonaAction` / generate section; Hiring Team add-person `offerPersonPrep` |
| **Decision taken** | **STOP on stripping prep side effects.** Left assign as-is so existing contacts still get person_prep + cheat-sheet section when chosen on Stage. Persona/CONTACT_PROFILE requirement already satisfied. |

Awaiting PO decision: keep current assign side effects, or make assign truly assign-only and rely on the remaining prep paths above.

---

## REPORT 4 — Thank-you clarifying questions on Outreach

**They existed on Stage** and were moved.

**Preservation:**

1. Workspace loads `notesAfter`, `thankYouClarifyJson`, first interviewer `contactId` (`ApplicationWorkspace.tsx` interviewStages select).
2. Outreach filters stages with `notesAfter?.trim()` and `interviewerContactId` (**536–539**).
3. `stageThankYouClarify` (**179–198**) mirrors Stage’s pending-questions logic.
4. If `needsAnswers`: form `thank-you-answers-{stageId}` posts answers via `generateOutreachAssetAction` with `purpose=THANK_YOU` (**556–592**) — same as Stage.
5. Email / LinkedIn buttons set `skipThankYouQuestions=1` **only when** `clarify.needsAnswers` (skip path), same as Stage (**610–616**, **633–639**).
6. Generator path no longer auto-skips all thank-you generations (§2).

---

## REPORT 5 — Answers given through Stage still on Harper

**How Stage answers were stored (unchanged storage):**  
`answerCheatSheetCoachItem` (`application-summary/service.ts` **1014–1036**) creates CONSULTANT + SEEKER `ConsultationTurn` rows with `targetKey = cheatSheet:{itemId}` on the campaign’s `ConsultationSession`, plus statements / profile fact.

**How Harper shows them:**  
`ConsultationSection` loads all session turns → `buildConsultationQaView` → `buildHarperQaLayout` (`harper-layout.ts`). `cheatSheet:` keys are not `person-prep:`, so they appear in Harper’s general/QA surface (not deleted by B1).

**Verification:** Automated test in `src/lib/interview/harper-batch-b1.test.ts` (“answers given through Stage cheat-sheet coach still live in Harper session turns”) asserts the write path (`targetKey = cheatSheet:…`, `consultationTurn.create`) and Harper read path (`buildConsultationQaView`, `buildHarperQaLayout`, `contactIdFromPersonPrepTarget`). No migration; removing Stage UI does not delete turns. New Stage CS answers are no longer possible (body removed); Cheat Sheet page can still create the same turn shape.

---

## REPORT 6 — Every file changed

| File | Role |
|------|------|
| `docs/prompts/harper-batch-b1-stage-timeline-outreach.md` | Saved input prompt |
| `docs/prompts/harper-batch-b1-stage-timeline-outreach-report.md` | This report |
| `src/components/InterviewStageOpenActions.tsx` | Post Interview Notes only |
| `src/components/InterviewStagePanel.tsx` | Timeline interviewer UI; Harper link; no CS |
| `src/components/InterviewStagesSection.tsx` | Timeline + Post Interview Notes; no outreach/gap/CS |
| `src/components/ApplicationOutreachSections.tsx` | Stage follow-up thank-you/check-in + clarify; skip fix |
| `src/components/ApplicationWorkspace.tsx` | Richer interviewStages for outreach |
| `src/app/(app)/campaigns/[id]/interviews/[stageId]/page.tsx` | Detail without CS embed |
| `src/lib/application/workspace-links.ts` | `workspaceHarperContactHref` |
| `src/lib/product-config/interview.ts` | `postInterviewNotes` label |
| `src/lib/interview/harper-batch-b1.test.ts` | **New** B1 tests |
| `src/lib/application/pass2-assets-personas-interviews.test.ts` | Updated open-stage expectations |
| `src/lib/application/contact-edit-page.test.ts` | Stage Edit → Harper link |
| `src/lib/application/no-ai-on-view.test.ts` | Stage/Outreach render = no enqueue |

---

## REPORT 7 — Tests added/changed + suite result

### Added

`src/lib/interview/harper-batch-b1.test.ts`:

- Stage has no review-open-questions, CS body, gap CTA, or outreach elements  
- Interviewer name links to `#harper-contact:…`; no Edit  
- Use this interviewer: no persona/CONTACT_PROFILE; prep side effects still present (STOP documented)  
- Post Interview Notes opens form with gained info + notes before/after + decision + outcome + save; add stage / add interviewer still present  
- Outreach renders thank-you clarify/email/LinkedIn/check-in under notesAfter+interviewer; generator not always-skip  
- Stage-era `cheatSheet:` turns still wire into Harper QA view  

### Changed existing (reasons)

| File | Why |
|------|-----|
| `pass2-assets-personas-interviews.test.ts` | Open-stage control is Post Interview Notes; review-open-questions and Stage CS body removed by B1 |
| `contact-edit-page.test.ts` | Stage no longer uses `workspaceContactEditHref`; uses `workspaceHarperContactHref` per B1 |
| `no-ai-on-view.test.ts` | Assert Stage + Outreach page/components do not enqueue jobs or call `runPaidStructuredCall` on render |

### Full suite

```
npm run db:test:up   # TEST Postgres 127.0.0.1:5435, aimedjobseek_test
npm test             # vitest run

Test Files  249 passed (249)
     Tests  1851 passed (1851)
```

Real-Postgres-backed tests ran as part of this suite (consultation/application DB tests against `:5435`). No new failures. Existing tests were only changed to match intentional B1 UI contracts, not weakened to hide failures.

---

## REPORT 8 — Confirmation of unchanged scope

| Area | Status |
|------|--------|
| Harper consultation page (`ConsultationSection` / Standing / Thread), prompts (`prompt-content/consultation.ts`), planning (`planAndStoreRound` / coach) | **Unchanged** |
| Cheat Sheet page (`summary/page.tsx` + `CheatSheetPersonBody`) | **Unchanged** (still has person prep + coach items) |
| What note fields feed (storage columns, coach evidence, person payload, CS sources, save enqueues) | **Unchanged** — only Stage form placement moved |
| Interview-guide clarifying backend | **Unchanged** (still no Stage UI) |
| Phase 1 paid-call gate, serialization, CONSULTATION drain | **Unchanged** |
| Schema / migrations / data repair | **None** |
| Page-view enqueue from Stage/Outreach render | **None** (asserted in no-ai-on-view) |
| New paid-call types / new features beyond B1 | **None** |

---

**End of complete B1 report.**
