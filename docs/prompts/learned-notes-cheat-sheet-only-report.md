# Learned notes → cheat sheets only — REPORT

**Repo:** `C:/Repos/aimed-jobseek` → `https://github.com/emaron01/aimed-jobseek.git` (`main`)  
**Prompt:** `docs/prompts/learned-notes-cheat-sheet-only.md`  
**Mode:** Implemented after STEP 1. No STOP (prompt text / schema unchanged).

---

## 1. STEP 1 findings

### Seeker “what I learned” fields

| Field | Stored on | UI |
|-------|-----------|-----|
| `seekerLearnedNotes` | `JobRequirement.seekerLearnedNotes` | Job Requirements “What I've learned” (`ApplicationJobRequirementActions.tsx`) |
| `notesBefore` | `InterviewStage.notesBefore` | Interview stage form (`InterviewStagesSection.tsx`) |
| `notesAfter` | `InterviewStage.notesAfter` | Same (label: what was discussed / learned) |
| Cheat-sheet interview note | `CampaignContact.cheatSheetNotesJson` | Per-interviewer note on cheat sheet (already cheat-sheet-only; out of scope except as existing pattern) |

### Reads (before this change)

| Reader | File:line | Use |
|--------|-----------|-----|
| Job parse messages | `job-requirement/prompt.ts` **7–19**; `parse.ts` **16, 36** | Optional `seekerLearnedNotes` in user JSON |
| Save posting → parse | `application/service.ts` **~913** (was) | Passed notes into `interpretJobPosting` |
| Save learned notes → parse | `application/service.ts` **965–980** (was) | Re-parsed posting with notes |
| Regenerate service | `application/service.ts` **923–946** (was) | Re-parse with notes |
| Interview notes → regenerate | `actions/interview.ts` **135** (was) | Called regenerate on `notesTextChanged` |
| Cheat-sheet sources | `application-summary/service.ts` **437–441** | `job:learned-notes` already appended |
| Cheat-sheet fingerprint | `application-summary/service.ts` **377–383** | `notesAfter` (not `notesBefore`); requirement `updatedAt` only |
| Stage notes in sources | — | **Missing** (fingerprint only) |
| Harper evidence | `consultation/service.ts` **782+, 988–993** | `learnedNotesEvidence` + stage notes |
| Interview guide sources | `interview/guide.ts` **264–267** | `notesBefore` / `notesAfter` as APPLICATION sources |
| Outreach thank-you | `application-assets/outreach.ts` **855–861** | Reads `notesAfter` |

### Triggers when notes change (before)

| Change | Triggers |
|--------|----------|
| Save learned notes | DB update → **`interpretJobPosting`** → persist scorecard → `CONSULTATION` reassess |
| Stage `notesBefore`/`notesAfter` change | `stages.ts` **199–210** → `enqueueInterviewerCheatSheetSection`; `interview.ts` **134–145** → **`regenerateApplicationJobRequirement`** + `CONSULTATION` reassess; optional `refreshConsultationOffer` on `notesAfter` |

**No STOP:** Stage notes can be added via existing `appendSource` + `allowedSources` (prompt already says “Use only allowedSources”). No prompt text or schema change required.

---

## 2. What changed (implementation steps)

### Step 1 — Stop notes from feeding / triggering job parse
- `src/app/actions/interview.ts`: removed `regenerateApplicationJobRequirement` import and call (**was ~135**); kept `CONSULTATION` reassess on `notesTextChanged`.
- `src/lib/application/service.ts` `saveApplicationJobPosting`: `interpretJobPosting(posting, usage)` only — **no** `seekerLearnedNotes` argument.
- `saveApplicationJobLearnedNotes`: saves notes only; **no** `withJobRequirementProcessing` / `interpretJobPosting`; enqueues `APPLICATION_SUMMARY` (shell) + person sections for contacts with a chosen persona; keeps `CONSULTATION` reassess.

### Step 2 — Regenerate service
- **Removed** `regenerateApplicationJobRequirement` from `service.ts` (no remaining callers after interview.ts change).

### Step 3 — Keep cheat-sheet enqueue on interview notes
- Unchanged in `src/lib/interview/stages.ts` **199–210** (`enqueueInterviewerCheatSheetSection`).

### Step 4 — Feed learned content into cheat-sheet sources
- `src/lib/application-summary/service.ts`: after `job:learned-notes`, append `interview:{stageId}:notesBefore` and `interview:{stageId}:notesAfter` via `appendSource` (category `JOB`). Shell (`sourcesForShell`) and person (`sourcesForPersonSection`) both receive them. No prompt text change.

### Step 5 — Fingerprints consistent with sources
- Shell `sourceFingerprint.requirement` now includes `seekerLearnedNotes`.
- `interviewStages` fingerprint now includes `notesBefore` and `notesAfter`.
- Person-section `inputHash` already hashes filtered sources, so stage/learned note text changes invalidate the skip.

---

## 3. Regenerate service

**Removed.** After deleting the `interview.ts` caller, nothing else called `regenerateApplicationJobRequirement` (UI action was already removed in the prior Job Requirements page change).

---

## 4. Every file changed

| File | Change |
|------|--------|
| `docs/prompts/learned-notes-cheat-sheet-only.md` | Prompt saved |
| `src/app/actions/interview.ts` | No job regenerate on note change |
| `src/lib/application/service.ts` | Learned notes save without parse; posting parse without notes; regenerate removed |
| `src/lib/application-summary/service.ts` | Stage notes in sources; fingerprint includes learned + notesBefore |
| `src/lib/application/learned-notes-cheat-sheet-only.test.ts` | **New** tests |
| `src/lib/application/job-requirement-page.test.ts` | Posting save no longer expects notes→parse |
| `src/lib/application/no-ai-on-view.test.ts` | Expect no regenerate on notes |
| `src/lib/workflow/workflow-audit-fixes.test.ts` | Expect no regenerate from interview notes |
| `docs/prompts/learned-notes-cheat-sheet-only-report.md` | This report |

---

## 5. Tests

### Added
- `learned-notes-cheat-sheet-only.test.ts`: static + Postgres — no parse on learned/stage notes; cheat-sheet enqueue; sources contain learned + `notesAfter`; unchanged stage notes do not bump job count; posting save still parses without notes arg; regenerate service gone.

### Changed existing (why)
| File | Reason |
|------|--------|
| `job-requirement-page.test.ts` | Product rule: learned notes no longer trigger/feed parse; posting save asserts `call[2]` undefined |
| `no-ai-on-view.test.ts` | Asserts absence of regenerate on notes (old regex expected it) |
| `workflow-audit-fixes.test.ts` | Same product change — interview notes must not regenerate job requirements |

### Suite result

```
Test Files  246 passed (246)
Tests       1826 passed (1826)
Duration    ~31s
```

Real-Postgres ran (e.g. learned-notes DB cases ~1.8s; job-requirement-page posting save; not skipped).

---

## 6. Unchanged confirmation

- No prompt text files edited (`prompt-content/*` untouched; `buildJobRequirementMessages` still accepts optional notes but live call sites do not pass them).
- No schema / migrations.
- `interpretJobPosting` scorecard production path unchanged for create/save posting (posting text only).
- Phase 1 gate, serialization, UI: unchanged.
- Harper page / assessment code: unchanged (consultation may still reassess on note change — not in the forbid list).
- Resume, cover letter, company research, personas: not triggered by these note paths.
