# Report: Paid-call guard Phase 1 implementation

**Repo:** `C:/Repos/aimed-jobseek` → `https://github.com/emaron01/aimed-jobseek.git`  
**Full suite:** 242 files, **1750 passed**, 0 failed.

---

## 1. CHANGE 3 — ApplicationJob type verification (index CREATED)

`findActiveJob` key today (`application-jobs/service.ts` **33–48**):  
`(organizationId, campaignId, type, targetId ?? null)` among `PENDING` | `IN_PROGRESS`.

Planned unique index uses the same key with `COALESCE(targetId, '')`.

| Type | targetId used today | Can two legitimately differ only by payload with same targetId? | Index safe? |
|---|---|---|---|
| `HIRING_TEAM_IDENTIFY` | `null` | No — one identify per campaign | Yes |
| `HIRING_TEAM_BUILD` | `personaId` | No — one build per persona | Yes |
| `CONTACT_PROFILE` | `contactId` | No — one profile per contact; concurrent contacts use different targetIds | Yes |
| `CONSULTATION` | usually `null`; one path uses `"reassess"` (`application-summary/service.ts` **913**) | Different answers already share `targetId: null` and are soft-deduped today — a second enqueue while one is active returns the existing job without a second row. Index matches that. Concurrent consultation for different contacts uses `targetId: contactId` in person-prep (`person-prep.ts` **79**) — different keys. | Yes |
| `RESUME` / `COVER_LETTER` | `null` | One active plan/generate per type per campaign | Yes |
| `OUTREACH` | `personaId` | One per persona target | Yes |
| `INTERVIEW_GUIDE` | `stageId` | One per stage | Yes |
| `APPLICATION_SUMMARY` | `sectionKey` (e.g. `contact:…`) | One per section key | Yes |
| `NEXT_STEP` | `null` | One per campaign | Yes |

**Decision:** Index **created** as planned. No job type can hold two active rows today for the same `(org, campaign, type, targetId)` under `findActiveJob`; the index hardens that.

---

## 2. Files changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | `PaidCallReceipt` model + Organization relation |
| `prisma/migrations/20260927180000_paid_call_receipt_and_active_job_uidx/migration.sql` | Table + unique receipt key + active-job partial unique index |
| `src/lib/ai/paid-call-gate.ts` | `fingerprintPaidCallInputs`, `runPaidStructuredCall`, `findPaidCallReceipt` |
| `src/lib/hiring-team/paid-inputs.ts` | Identify/synthesize fingerprints; peer identity helper (CHANGE 1) |
| `src/lib/hiring-team/ai.ts` | Gate wraps identify + synthesize `generateStructured` |
| `src/lib/hiring-team/build.ts` | Fingerprint staleAt; rebuild skip flags; `hiringTeamSynthesizeUnchanged` |
| `src/lib/application-jobs/process.ts` | Skip cheat-sheet/OUTREACH when synthesize skipped |
| `src/lib/application-jobs/service.ts` | Unique-violation enqueue; `FOR UPDATE SKIP LOCKED` claim |
| `src/app/actions/hiring-team.ts` | CHANGE 2 pre-queue skip + message |
| `src/lib/ai/paid-call-guard.phase1.test.ts` | New Phase 1 tests |
| `src/lib/hiring-team/hiring-team.test.ts` | Pass new synthesize args; mock gate for unit AI tests |
| `src/lib/application/harper-workspace.test.ts` | Assert CONSULTATION + SKIP LOCKED in claim |
| `docs/prompts/paid-call-guard-phase1-implement.md` | Saved implement prompt |

### Migration SQL

```sql
-- PaidCallReceipt table + unique (organizationId, operation, subjectKey)
-- ApplicationJob_active_org_campaign_type_target_uidx
--   ON (organizationId, campaignId, type, COALESCE(targetId, ''))
--   WHERE status IN ('PENDING', 'IN_PROGRESS');
```

(Full SQL in the migration file above.)

---

## 3. Final fingerprints

**Identify** (`hiringTeamIdentifyFingerprint`):
```json
{
  "promptVersion": "<HIRING_TEAM_IDENTIFICATION_PROMPT_VERSION>",
  "schemaName": "hiring_team_identification",
  "evidence": [{ "sourceId", "displayName", "text" }]
}
```
Subject: `campaignId`.

**Synthesize** (`hiringTeamSynthesizeFingerprint`, CHANGE 1):
```json
{
  "promptVersion": "<PERSONA_SYNTHESIS_PROMPT_VERSION>",
  "schemaName": "persona_setup_synthesis",
  "roleName", "likelyTitles", "department", "whyThisRoleMatters",
  "involvement", "notes", "rejection",
  "excerpts": [{ "sourceId", "displayName", "text" }],
  "peers": [{ "id", "name", "likelyTitles", "involvement" }]
}
```
Peers sorted by `id`. **No** peer `painPoints` / `messagingNotes` / narrative.  
Subject: `personaId`. Model still receives full peer differentiation payload.

---

## 4. Tests

**Added:** `src/lib/ai/paid-call-guard.phase1.test.ts` — fingerprint stability, CHANGE 1 peer identity, wire-only contract, identify skip, receipt retry skip, concurrent enqueue/claim, non-stale after identify, synthesize unchanged.

**Updated:** hiring-team unit synthesize signatures; harper-workspace claim contract.

**Full suite:** `npx vitest run` → **242 files, 1750 passed, 0 failed.**

---

## 5. Scope confirmation

- Gate used only from `src/lib/hiring-team/ai.ts` (contract test).
- Provider adapters / `generateStructured` behavior unchanged for other callers.
- No prompt, model, persona content, or UI layout changes beyond action return message for CHANGE 2.
- No backfill of existing personas/receipts.

---

## 6. Deviations

1. **`npx prisma generate` EPERM** on Windows while query-engine processes held the file; client types already include `PaidCallReceipt` (generate had partially succeeded). Migrations applied to both `aimedjobseek` (5434) and test DB `aimedjobseek_test` (5435).
2. **Harper workspace source test** updated to match SQL claim (`CONSULTATION` + `FOR UPDATE SKIP LOCKED`) instead of Prisma `type: "CONSULTATION"` object literal.
3. **CHANGE 2 message** uses exact `No Changes To ${roleName} Persona` as specified (template literal in actions).

---

*End of implementation report.*
