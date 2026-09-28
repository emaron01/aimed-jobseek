# Job Requirements page — remove Scorecard / Regenerate — REPORT

**Repo:** `C:/Repos/aimed-jobseek` → `https://github.com/emaron01/aimed-jobseek.git` (`main`)  
**Prompt:** `docs/prompts/job-requirements-page-remove-scorecard-regenerate.md`  
**Mode:** Implemented after STEP 1. No schema, migrations, parse, or Harper changes.

---

## 1. STEP 1 findings

### 1.1 Readers of `scorecardJson` outside Job Requirements page display

None of these depend on the workspace Scorecard UI (they read DB / context / already-parsed scorecard).

| Consumer | File | Line(s) | Role |
|----------|------|---------|------|
| Persona build evidence | `src/lib/hiring-team/build.ts` | **143** (`readScorecard(requirement.scorecardJson)`) | Identify/build inputs |
| Persona evidence lines | `src/lib/hiring-team/evidence.ts` | **37–46**, **60** | Mission / outcomes / competencies text |
| Draft quality | `src/lib/hiring-team/draft-quality.ts` | **62–64** | Scorecard text in quality checks |
| Harper consultation load | `src/lib/consultation/service.ts` | **249** (`readScorecard(requirement.scorecardJson)`) | Assessment input |
| Harper assessment | `src/lib/consultation/assess.ts` | **252–274** | Outcomes / competencies / mission gaps |
| Generation context | `src/lib/generation/context.ts` | **389** (`scorecard: requirement.scorecardJson`) | Shared gen context |
| Resume/cover prompts | `src/lib/application-assets/prompt.ts` | **77** | Asset prompts |
| Asset evidence | `src/lib/application-assets/service.ts` | **430** (`scorecardOutcomeTexts(...)`) | Thin-evidence / claims |
| Cheat sheet sources | `src/lib/application-summary/service.ts` | **422** | Summary shell/person sources |
| Interview guide | `src/lib/interview/guide.ts` | **174** | Guide source material |
| Campaign summary page | `src/app/(app)/campaigns/[id]/summary/page.tsx` | **135** | Separate summary display (not Job Requirements) |

Writers (unchanged): `interpretJobPosting` / `persistInterpretedJobRequirement` in `src/lib/application/service.ts` (**320**, **869**).

**Job Requirements page display (removed):** was only in `ApplicationWorkspace.tsx` (local `readScorecard` + Scorecard section). That path did not feed any reader above.

### 1.2 Regenerate button

| Piece | Location |
|-------|----------|
| Button UI | `ApplicationJobRequirementActions.tsx` — `ApplicationActionForm` with `testId="regenerate-job-requirement"` (removed) |
| Server action | `regenerateApplicationJobRequirementAction` in `src/app/actions/application.ts` (removed) |
| Service | `regenerateApplicationJobRequirement` in `src/lib/application/service.ts` **923–947** (**kept**) |

**Callers of the server action before removal:** only the Job Requirements Regenerate button.

**Other callers of the service function:** `src/app/actions/interview.ts` **135** (`updateInterviewStageAction` when notes change). Therefore the **service stays**; only the unused **action** was removed.

### 1.3 Employer fit on Job Requirements page

| Part | Location | Hidden when `employerIcpFit` off? |
|------|----------|-----------------------------------|
| Employer fit `<details>` (title, bucket, criteria, override, rescore) | `ApplicationWorkspace.tsx` gated by `features.employerIcpFit && icp` | **Yes** — flag default `false` in `features.ts` **60** |
| `employer-skip-reason` banner | Same job section | Not Employer-fit scoring UI; left as-is (not part of ICP fit section) |
| Confirm-employer form | Same job section | Identity flow, not Employer fit; left as-is |

**Decision 3:** already fully hidden by the flag → **no code change**.

---

## 2. What changed for each decision

### Decision 1 — Remove Scorecard section
- `src/components/ApplicationWorkspace.tsx`: removed Scorecard heading, mission, Outcomes, Competencies, `scorecard-note` line; removed local `readScorecard` / `ScorecardList` helpers and unused `JobScorecard` / `consultationConfig` imports.
- Job fields, Responsibilities, Required/Preferred, Edit posting, learned notes, employer identity controls unchanged.

### Decision 2 — Remove Regenerate
- `src/components/ApplicationJobRequirementActions.tsx`: removed Regenerate form; Edit posting + learned notes unchanged.
- `src/app/actions/application.ts`: removed `regenerateApplicationJobRequirementAction` and its import of the service.
- Service `regenerateApplicationJobRequirement` kept for `interview.ts`.

### Decision 3 — Employer fit
- No change (already gated).

---

## 3. Every file changed

| File | Change |
|------|--------|
| `docs/prompts/job-requirements-page-remove-scorecard-regenerate.md` | Prompt saved |
| `src/components/ApplicationWorkspace.tsx` | Scorecard UI + helpers removed |
| `src/components/ApplicationJobRequirementActions.tsx` | Regenerate button removed |
| `src/app/actions/application.ts` | `regenerateApplicationJobRequirementAction` removed |
| `src/lib/application/job-requirement-page.test.ts` | Updated/added assertions for removals, readers, Harper, posting save |
| `src/lib/product-config/employer-icp-fit-gate.test.ts` | Expect no Scorecard display |
| `src/lib/application/restore-workspace.test.ts` | Expect no regenerate action on job page |
| `docs/prompts/job-requirements-page-remove-scorecard-regenerate-report.md` | This report |

---

## 4. Tests

### Added / updated (reasons)

| Test file | Why changed |
|-----------|-------------|
| `job-requirement-page.test.ts` | Product UI no longer has Scorecard/Regenerate; assert absences; assert STEP 1 readers + Harper still wired; DB case now saves posting only (no page regenerate path) and still asserts `scorecardJson` from parse |
| `employer-icp-fit-gate.test.ts` | Prior test required Scorecard to remain; product decision removed it — updated expectation (not softened to pass unrelatedly) |
| `restore-workspace.test.ts` | Prior test required `regenerateApplicationJobRequirementAction` — action removed |

### Suite result

```
Test Files  245 passed (245)
Tests       1818 passed (1818)
Duration    ~39s
```

Real-Postgres confirmed: `job requirement learned notes and posting save > saves learned notes and uses them when the posting is saved` ran (~698ms) under `describe.skipIf(!hasTestDatabase())` — not skipped.

---

## 5. Unchanged confirmation

- `interpretJobPosting` / parse prompt / `scorecardJson` production: **unchanged**
- Harper page (`ConsultationSection`) and assessment (`assess.ts` / consultation scorecard load): **unchanged**
- All STEP 1 `scorecardJson` readers: **unchanged** (asserted in tests)
- Employer fit section: **unchanged** (still flag-gated)
- No other Job Requirements sections/buttons removed beyond Scorecard + Regenerate
