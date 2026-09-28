# Report: Planning ops preserve + single drain + concurrency envs

**Repo:** `C:/Repos/aimed-jobseek` → `https://github.com/emaron01/aimed-jobseek.git`  
**Suite:** 243 files, **1763 passed** (real-Postgres serialize tests ran, not skipped).

---

## 1. ITEM 1 — Planning operations on PENDING reuse

**Before:** `mergeApplicationJobPayload` (`service.ts`) stored a single `payload.operation` string. On a non-drain incoming op it set `merged.operation = incomingOp`, overwriting any prior planning op. Drain-only ops (`process_reply` / `answer` / `reply` / `edit_answer`) did not overwrite an existing planning op. **It could not hold more than one planning operation.** Example: `reassess` then `continue` → only `continue` remained; `continue` was lost if `reassess` arrived second.

**Change:** Preserve an ordered unique list in `payload.operations` (plus `operation` = first for progress/legacy). Helpers: `isConsultationDrainOnlyOperation`, `consultationPlanningOperationsFromPayload`, updated `mergeApplicationJobPayload`. Duplicates of the same op collapse to the first occurrence. Drain-only requests do not clear the queue.

**Run order (justified):**
1. **Drain incomplete SEEKER turns from DB first** — answers must be analyzed before planning (`continue` / `reassess` / `start` read session/QA state that depends on those turns).
2. **Planning ops in request order** — FIFO of what was merged onto PENDING while the prior job ran.
3. **Same op twice → once** — e.g. two `reassess` while waiting; second is a no-op on the queue because reassessment always reads latest DB.

---

## 2. ITEM 2 — One drain implementation

**Kept:** `src/lib/consultation/drain.ts` → `drainConsultationUnprocessedInput` (lists incomplete turns, then calls `processConsultationReply`). Worker `process.ts` calls only this.

**Removed:** Duplicate drain loop from `process.ts` (inline `listIncomplete…` + `processConsultationReply`) and the prior export of `drainConsultationUnprocessedInput` from `consultation/service.ts` (which called the local binding and was not mockable).

**Mockable:** `drain.ts` imports `processConsultationReply` from `service`, so vitest mocks of that export apply. Behavior unchanged: same list order, same per-turn process, same skip-if-complete inside `processConsultationReply`.

---

## 3. ITEM 3 — Concurrency environment variables (report only)

### `RESEARCH_CONCURRENCY` / `getResearchConcurrency` (`config.ts` **18–30**)
| Caller | Service | What it limits |
|---|---|---|
| **None in production** | — | — |
| `src/lib/research/config.test.ts` only | test | unit tests of the getter |

**Plainly: `RESEARCH_CONCURRENCY` has no production caller.** Setting it (including `=10`) does nothing in web or worker today. Default in code would be **5** if something called it.

### `RESEARCH_WORKER_CONCURRENCY` / `getResearchWorkerConcurrency` (`config.ts` **40–49**)
| Caller | Service | What it limits |
|---|---|---|
| `scripts/research-worker.ts` **79, 92** | **background worker** | Concurrent ApplicationJobs + ResearchRuns in the worker loop |
| `src/lib/research/runs-service.ts` **882** (`processResearchRun` → `mapPoolWithShutdown`) | **background worker** (invoked from the worker) | Concurrent companies inside one ResearchRun |

Default **5**. Not read by the web service.

### Other concurrency-related values
| Name | Default | Who reads | Notes |
|---|---|---|---|
| `RESEARCH_WORKER_CONCURRENCY` | 5 | worker (above) | env |
| `RESEARCH_CONCURRENCY` | 5 (unused) | none in prod | env |
| `SCORING_CONCURRENCY` | **3** (constant) | scoring engine (`engine.ts` **239**) | **not** an env var; hardcoded in `scoring/config.ts` |

No other `*CONCURRENCY*` env vars found in production code.

---

## 4. Files changed

| File | Change |
|---|---|
| `src/lib/application-jobs/types.ts` | `operations?: string[]` on payload |
| `src/lib/application-jobs/service.ts` | Planning-op merge helpers; preserve queue on PENDING reuse |
| `src/lib/application-jobs/process.ts` | Call single drain; run all planning ops in order |
| `src/lib/consultation/drain.ts` | **New** — sole drain implementation |
| `src/lib/consultation/service.ts` | Removed duplicate `drainConsultationUnprocessedInput` export |
| `src/lib/application-jobs/serialize-same-key.test.ts` | Merge/order tests; single-drain source assert; planning-ops DB test |
| `docs/prompts/application-job-serialize-planning-ops-drain-fix.md` | Saved prompt |

---

## 5. Tests + suite

- Source: worker uses `drainConsultationUnprocessedInput`; service no longer exports it; merge preserves ops / collapses duplicates.
- DB: two planning ops (`reassess` then `continue`) both run once in that order; duplicate `reassess` collapsed; existing drain tests still pass.
- **Full suite:** 243 files, **1763 passed**. Real-Postgres serialize describe ran (not skipped).

---

## 6. Scope confirmation

Only ITEM 1 and ITEM 2 code changes. ITEM 3 report only. No prompts, models, providers, policy mapping, indexes, Phase 1 receipts, configuration, or UI changes.

---

*End of report.*
