# REPORT — Harper Batch B3 (person view, search, Add Interview Contact, assign-only)

**Repo:** `C:/Repos/aimed-jobseek` → `origin` `https://github.com/emaron01/aimed-jobseek.git`  
**Branch:** `checkpoint/harper-prep-hub`  
**Prompt:** `docs/prompts/harper-batch-b3-implement.md`

---

## 1. What changed per decision

### Decision 1 — Overview gaps under Where you stand
- `isOverviewGapCheatSheetTarget` in `src/lib/consultation/harper-layout.ts` **48–56**.
- `partitionGeneralQuestionsForStanding` places contentful `cheatSheet:overview:gap:*` into `orphanedRequirementTopics` (**262–267**) — same no-rating treatment as dropped requirements via existing `ConsultationSection` orphan merge (`strength: null`).
- Counts in `collectRenderedHarperQuestionTurnIds` / B2 invariant.
- Legacy `cheatSheet:role:*` and null target keys remain unmapped (no new code).

### Decision 2 — Search on Harper
- `HarperPeopleFilter` / `HarperFilterProvider` in `src/components/HarperPeopleFilter.tsx`.
- Reuses `applicationSummaryConfig.actions.filterPeople` (“Find a person or Hiring Team role”).
- Wired in `ConsultationSection.tsx`; default view is `HarperStandingView` (Where you stand).

### Decision 3 — Person inline profile
- `HarperPersonInlineProfile` in `src/components/HarperPersonView.tsx` reuses `CheatSheetPersonBody` (same order: cares → connection → positioning → key statements → likely questions → questions to ask) with `showCoachAnswerForms={false}`.
- Person-prep + `cheatSheet:contact:*` Q&A via shared `QuestionList` under `data-testid="harper-person-qa"`.
- Summary guidance loaded read-only via `getApplicationSummaryView` (no generate on view).

### Decision 4 — Interviewer cards + `#harper-contact:{id}`
- Prep cards use `HarperSelectPersonLink` → person view.
- Hash `#harper-contact:{id}` handled in `HarperFilterProvider` (`sectionKeyFromHarperHash`).

### Decision 5 — Add Interview Contact
- Label `interviewConfig.labels.addInterviewContact` = **"Add Interview Contact"** (`interview.ts` **19**).
- `addInterviewContact` in `stages.ts` **390–441**; action `addInterviewContactAction`.
- Form: `HarperAddInterviewContactForm`.
- Contact is a normal campaign contact → available to Stage “Use this interviewer” people list.

### Decision 6 — Start prep on Harper
- Control label: **`interviewConfig.labels.personPrepStart` = "Start interviewer prep"** (`interview.ts` **55**).
- Shown only when `!prepStarted` (`personPrepOfferedAt` unset).
- `startPersonPrepForContact` (`stages.ts` **447+**) → `offerPersonPrep` + `enqueueInterviewerCheatSheetSection`.

### Decision 7 — Use this interviewer assign-only
- `assignExistingInterviewStageInterviewer` (`stages.ts` **284–327**) only `replaceStageInterviewer` — no `offerPersonPrep`, cheat-sheet section, persona build, or contact profile.

### Decision 8 — No new paid calls; reply wait in person view
- Person view `showReply` gated on `!jobsActive` (`consultationBusy`), same as standing/thread.
- Phase 1 gate / serialization / drain unchanged.

---

## 2. Paths reused (Add Interview Contact / start prep) and cost

| Path | Job / paid | Used by |
|------|------------|---------|
| `addApplicationContact` | DB only | Add Interview Contact |
| `saveLinkedInPaste` | CONTACT_PROFILE (then cheat sheet after profile) | Add Interview Contact when LinkedIn pasted |
| `offerPersonPrep` | CONSULTATION `person_prep` | Add Interview Contact; Start interviewer prep |
| `enqueueInterviewerCheatSheetSection` | APPLICATION_SUMMARY `contact:{id}` | Add Interview Contact (no paste); Start interviewer prep |
| `buildCheatSheetPersonaAction` / generate section | Existing HIRING_TEAM_BUILD / SUMMARY | Via `CheatSheetPersonBody` when unbuilt / missing section (seeker click) |

No new paid call types.

---

## 3. Start-prep label and new wording

- **Start-prep label used:** `"Start interviewer prep"` (`personPrepStart`).
- **New wording added:** `"Add Interview Contact"` (`addInterviewContact`) — PO-approved string from the prompt.
- Stage `sectionHelp` still mentions cheat sheet on Stage — **unchanged in B3**; PO can supply replacement later (plan risk).

---

## 4. Every file changed

**New**
- `docs/prompts/harper-batch-b3-implement.md`
- `src/components/HarperPeopleFilter.tsx`
- `src/components/HarperPersonView.tsx`
- `src/lib/consultation/harper-batch-b3.test.ts`
- `docs/prompts/harper-batch-b3-implement-report.md` (this file)

**Modified**
- `src/lib/consultation/harper-layout.ts`
- `src/lib/interview/stages.ts`
- `src/lib/product-config/interview.ts`
- `src/app/actions/interview.ts`
- `src/components/ConsultationSection.tsx`
- `src/components/CheatSheetPersonBody.tsx` (`showCoachAnswerForms` prop; CS default unchanged)
- Tests: `harper-batch-a/b1/b2/b2-unmapped`, `qa-view`, `harper-workspace`, `no-ai-on-view`, `interview.test.ts`

---

## 5. Tests

**Added:** `src/lib/consultation/harper-batch-b3.test.ts` — all B3 assertions listed in the prompt.

**Changed existing tests (reasons):**
| Test | Why |
|------|-----|
| `harper-batch-b1` Use this interviewer | B3 assign-only — no longer expects prep/cheat-sheet enqueue |
| `harper-batch-b2` / `b2-unmapped` overview gaps | B3 places overview gaps under standing |
| `harper-batch-a`, `qa-view`, `harper-workspace` | Interviewer Q&A moved from `ConsultationThread` mount to `HarperPersonInlineProfile` |
| `no-ai-on-view` | Assert person view / filter also enqueue-free |
| `interview.test.ts` assign path | Assign no longer creates SUMMARY job for existing contact |

**Results**
- Full suite: **252** files / **1875** tests pass (real Postgres via `TEST_DATABASE_URL` / `db:test:up`)
- `npx tsc --noEmit -p tsconfig.json`: pass
- `npm run lint`: pass (0 errors; 2 pre-existing warnings in `step0-assess-hiring-team-drafts.ts`)
- `npm run build` (`next build`): pass

---

## 6. Commit / branch

- Branch: `checkpoint/harper-prep-hub` (updated from `main` before work)
- Commit hash: `5e9b0de3ab8a9f7ba36e0f0bafb7cfc1df6de563`
- Pushed to `origin/checkpoint/harper-prep-hub`. **Did not merge or push `main`.**

---

## 7. Unchanged confirmation

Cheat Sheet page answering UX, Outreach, Harper prompts/planning, learnings, Phase 1 gate, serialization, and paid-call semantics are unchanged beyond reusing the existing seeker actions above. Rendering Harper / person view does not enqueue jobs or call `runPaidStructuredCall`.
