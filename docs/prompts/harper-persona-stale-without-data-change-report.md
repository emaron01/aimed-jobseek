# Prompt: Why built personas show Stale with no seeker data change (report only)

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
All findings must be based on the actual code as it exists now. Cite file paths, function names, and line numbers for every claim. No guesses; if something cannot be determined from the code, say so explicitly.

SURGICAL RULE
REPORT ONLY. Do not change any code, configuration, schema, prompts, tests, or data. Write the report and stop.

CONTEXT
Built roles showed "Stale" with no seeker data change. Find exactly what marks them stale.

---

# Report: Stale without data change

**Repo confirmed:** `C:/Repos/aimed-jobseek` → `https://github.com/emaron01/aimed-jobseek.git` (`main`)  
**Status:** REPORT ONLY — no code changes.

---

## 1. Definition — what sets Stale, and what is compared

**The only production write of Hiring Team persona `staleAt`:**

`syncApplicationHiringTeam` in `src/lib/hiring-team/build.ts` **390–394**, inside the update of an **existing** role when `built` is true:

```390:394:src/lib/hiring-team/build.ts
          ...(built
            ? {
                staleAt: new Date(),
                staleReason: hiringTeamConfig.staleReason,
              }
```

`built` is `isHiringTeamPersonaBuilt(existing)` (**358**): `setupStatus` is `NEEDS_REVIEW` or `APPROVED`, **or** `profileJson.narrative` is an object (**270–283**).

**Comparison performed:** **none.**

There is no hash, fingerprint, prompt version, field diff, or timestamp compare against prior identify inputs before setting `staleAt`. If the role already exists in the sync loop and is built, every successful pass through this update sets a fresh `staleAt` and `staleReason: hiringTeamConfig.staleReason` (`product-config/hiring-team.ts` **9**: copy claiming job or employer research changed).

**UI:** `hiringTeamStatusLabel` returns `"Stale"` when `staleAt` is truthy (`ApplicationWorkspace.tsx` **1056–1061**, rendered **1128–1130**).

**Clears stale:** `queueHiringTeamBuild` sets `staleAt: null` (**453**); successful rebuild with narrative clears it (**744–745**).

**Not related:** `markIdentityDependentsStale` (`research-finish.ts` **223–237**) only marks **ApplicationFit** stale, not Persona `staleAt`.

---

## 2. Every trigger that can re-identify or set Persona Stale

`staleAt` is set only when `syncApplicationHiringTeam` runs. That function is invoked only from the worker:

| Trigger | How it reaches sync | Origin |
|---|---|---|
| Worker job `HIRING_TEAM_IDENTIFY` | `processApplicationJob` → `syncApplicationHiringTeam` (`application-jobs/process.ts` **68–72**) | Worker |

**What enqueues `HIRING_TEAM_IDENTIFY` / `queueHiringTeamIdentify`:**

| Path | Function | Lines | Seeker action? |
|---|---|---|---|
| Research finishes (identified employer) | `finishApplicationAfterResearch` enqueues job | `research-finish.ts` **324–329** | Indirect (research completion, not “open Personas”) |
| Job attach / undisclosed / no research run | `queueHiringTeamIdentify` | `service.ts` **232–235**, **277–280** | Creating/attaching posting |
| Confirm employer identity | `confirmApplicationEmployerIdentity` | `service.ts` **541–544** | Explicit confirm |
| Reject employer identity | `rejectApplicationEmployerIdentity` | `service.ts` **571–574** | Explicit reject |
| `ensureHiringTeamAfterResearch` | Queues if research ready and latest persona `updatedAt` **&lt;** research `updatedAt` | `service.ts` **678–719** | **Not called from page view** (see §3); **no other production caller found** (only definition + tests/docs) |

**Does not set Persona `staleAt`:**

- Deploy alone (no job)
- `mergeExistingHiringTeamRoles` (no `staleAt` writes — `merge-existing.ts`)
- `ensureIdentityVerification` on workspace load (`service.ts` **449–507** — no `queueHiringTeamIdentify`)
- Today’s `modelNote` / `persona-synthesis` prompt edits (no `staleAt` writes)

---

## 3. Page load

**Personas and Interviewers page:**  
`src/app/(app)/campaigns/[id]/hiring-team/page.tsx` **16–30** → `ApplicationWorkspace` with `focus="hiring-team"`.

**Workspace load call chain** (`ApplicationWorkspace.tsx` **302–314**):

1. `ensureIdentityVerification({ organizationId, campaignId })` — **313**
2. `mergeExistingHiringTeamRoles({ organizationId, campaignId })` — **314**

**Neither calls `syncApplicationHiringTeam` nor `queueHiringTeamIdentify`.**  
`mergeExistingHiringTeamRoles` may archive duplicates / rewrite name/titles/why on survivors (**255–264**); it **never** sets `staleAt` (confirmed: no `staleAt` in `merge-existing.ts`).

**Guard in tests:** `no-ai-on-view.test.ts` **11–21**, **45–48** asserts workspace does **not** contain `ensureHiringTeamAfterResearch` or `enqueueApplicationJob`.

**Conclusion:** Viewing the Personas page (or any ApplicationWorkspace focus) **cannot** re-identify roles or mark them Stale by itself.

---

## 4. Today’s changes vs the stale comparison

| Change | Touches stale logic? | Included in a “staleness compare”? |
|---|---|---|
| `build.ts` — stop folding `dropped` into `modelNote` (`identifiedRoles` notes assembly ~**167–173**) | No | N/A — **there is no compare** |
| `persona-synthesis.ts` — `candidateConcerns` sentence | No; `PERSONA_SYNTHESIS_PROMPT_VERSION` still `"13"` | Prompt version is **not** read when setting `staleAt` |

**Deploying either change alone would not mark existing built roles Stale.** Stale appears only after a worker runs `syncApplicationHiringTeam` on those personas.

(Deploy could *coincide* with a worker processing a pending `HIRING_TEAM_IDENTIFY` job; that would mark Stale because of §1’s unconditional stamp, not because of the prompt/modelNote diff.)

---

## 5. Most likely cause

**Root cause in code (why “no input change” still shows Stale):**  
Any run of `syncApplicationHiringTeam` stamps **every matched built role** with `staleAt: new Date()` with **no check** that job text, research, or identify outputs changed (**390–394**). Six built roles → six Stale chips from one identify sync.

**Proximate trigger (what ran identify):** Cannot be proven from code alone for this specific campaign without job/DB history. Ranked possibilities:

| Rank | Trigger | Why plausible | How to distinguish |
|---|---|---|---|
| 1 | Worker completed `HIRING_TEAM_IDENTIFY` for the campaign | Only path that sets Persona `staleAt` | `ApplicationJob` row: type `HIRING_TEAM_IDENTIFY`, status `COMPLETED`, `completedAt` near when Stale appeared |
| 2 | Research finish re-enqueued identify (`research-finish.ts` **324–329**) | Runs when research path finishes identified employer; seeker may not think of research worker as “changing data” | Job preceded by research job completion; research `updatedAt` movement |
| 3 | Identity confirm/reject (`service.ts` **541**, **571**) | Explicit seeker action — PO said none | Would require that action |
| 4 | Orphaned `ensureHiringTeamAfterResearch` | Could queue if research `updatedAt` &gt; latest role `updatedAt` (**710–718**) | **No production caller found**; unlikely unless an unlisted entrypoint exists outside `src/` grep |
| 5 | Page view / today’s prompt or modelNote commit | Ruled out by §3–§4 | — |

**Evidence supporting rank 1 + unconditional stamp:** sole `staleAt: new Date()` write site; sync always takes that branch for built roles; page load and today’s commits do not write `staleAt`.

---

## 6. Correct definition vs current comparison

**Legitimate “out of date” (product sense):** built general persona should be stale only when **inputs that synthesis/identify use for that role** changed in a material way — at minimum job requirement evidence and, when included, company research evidence (`hiringTeamEvidenceExcerpts` / `loadApplication` in `build.ts` **88–135**, **348–352**). Optionally: seeker-edited identity fields vs last build. Not: internal `modelNote` assembly, dropped-role diagnostics, or prompt instruction text that was not bumped into a version-driven rebuild.

**What the code does:** marks stale on **every** identify sync for every still-present built role, **without** comparing those inputs. The stored `staleReason` string asserts job/research changed (`hiring-team.ts` **9**) even when they did not — the reason text does not reflect an actual diff.

---

## TESTS (for a future fix — not written/run here)

1. **Page view never re-identifies / never sets `staleAt`:** render/workspace path (or source contract) does not call `syncApplicationHiringTeam` / `queueHiringTeamIdentify`; after a simulated page load helper, built personas keep `staleAt === null`.
2. **`mergeExistingHiringTeamRoles` alone never sets `staleAt`.**
3. **Deploy / internal-only fields:** changing `modelNote` assembly or synthesis prompt instructions (without identify) does not set `staleAt`.
4. **Identify with identical job+research evidence:** `syncApplicationHiringTeam` (or a future diff gate) does **not** set `staleAt` when evidence fingerprint unchanged.
5. **Identify after real job or research change:** evidence fingerprint change **does** set `staleAt` on built roles that remain.
6. **Unbuilt roles** still reset to `NOT_STARTED` on identify as today; built roles keep narrative when not stale-gated incorrectly.

---

## Risks / unknowns

1. **Which job queued identify for this campaign** — needs `ApplicationJob` / logs; not recoverable from static code.
2. **`ensureHiringTeamAfterResearch` is dead for page view** but still exported; if anything outside the searched tree calls it, it could still queue identify when research timestamps move.
3. **Model non-determinism:** even with a future content compare on identify *outputs*, identical inputs can yield different role lists; stale should key off **input** evidence, not model output drift.
4. **Six roles all stale** fits a single sync pass over six built matches — not six separate seeker edits.

---

*End of report. No code, configuration, schema, prompts, tests, or data were changed beyond saving this prompt/report document.*
