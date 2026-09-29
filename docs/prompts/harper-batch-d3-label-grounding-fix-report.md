# Harper Batch D3 fix — label check + groundingJson on approve

**Branch:** `checkpoint/harper-prep-hub`  
**Commit:** _(filled after commit)_  
**Remote:** `https://github.com/emaron01/aimed-jobseek.git`

## 1. ITEM 1 — label check

**Before** (`containsFrameworkOrPartLabel`):
- Part labels: `(?:^|[\n.!?]\s*)(?:Challenge|Situation|Task|Action|Result)\s*:` with `i` and `m` flags.
- Framework: bare `\bCAR\b` or `\bSTAR\b` (case-sensitive uppercase only).
- That still rejected legitimate uppercase “STAR Club” and any bare `CAR`/`STAR` token.

**After:**
- (a) Part labels as labels/headings only: same colon pattern, plus a line that is only `Challenge|Situation|Task|Action|Result`.
- (b) Explicit method refs only (case-insensitive): `\b(?:the\s+)?(?:STAR|CAR)\s+(?:method|format|framework|technique)\b`.
- Bare star/stars/car/cars and ordinary “challenge”/“result” in sentences pass.

**Pass cases:** four-star rating; Rising Star award; car rental partnerships; STAR Club; “the challenge was…”; “the result was…”.  
**Reject cases:** `Challenge: …`; `Result: …`; `Using the STAR method…`; `… in CAR format`.

## 2. ITEM 2 — groundingJson on approve

**Why approve cleared it:** commit `9416ae4` removed claim grounding from polish statements (“writes statements without claim grounding”). Approve previously re-grounded claims into `groundingJson` when content changed; after that commit it always wrote `groundingJson: []` as the empty placeholder. D3 (`a84af8e`) stopped wiping on approve so CAR/STAR parts survive.

**Readers of `groundingJson` in `src/`:**
| Location | Role |
| --- | --- |
| `service.ts` (~1763–1773, 2039–2051, 2926–2938, 3252–3255) | **Writers** — store parts via `interviewAnswerGroundingJson`, or `[]` for bullets / no parts |
| `application-summary/service.ts` (~1134, 1141) | **Writer** — always `[]` on summary statements |
| `polish-parts.ts` | Shape comment + new `parseAnswerPartsGrounding` reader |
| Test fixtures (`application-summary` / `application-assets` tests) | Fixture writers only |

**No production code previously read** `ConsultationStatement.groundingJson` for behavior. Outcome: **keep** the D3 approve preserve. Added `parseAnswerPartsGrounding` as the canonical reader that accepts the parts object and returns `null` for legacy `[]` / unknown shapes. Approve update still omits `groundingJson` so Prisma leaves the column unchanged.

## 3. Files changed

- `src/lib/consultation/polish-parts.ts`
- `src/lib/consultation/harper-batch-d3.test.ts`
- `src/lib/consultation/consultation.test.ts` (approve keeps parts assertion)
- `docs/prompts/harper-batch-d3-label-grounding-fix.md`
- `docs/prompts/harper-batch-d3-label-grounding-fix-report.md`

## 4. Tests

**Updated:** `harper-batch-d3.test.ts` — pass/reject label cases; `parseAnswerPartsGrounding` for `[]` and parts; approve path source check.  
**Changed:** `consultation.test.ts` — after approve, assert `groundingJson` still parses as CAR parts (extends existing round test; does not weaken other assertions).

| Check | Result |
| --- | --- |
| `npm test` | **1937 passed**, 260 files |
| `npm run build` | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | 0 errors; 2 pre-existing script warnings |

## 5. Commit / branch

- Commit: _(filled after commit)_
- Pushed: `checkpoint/harper-prep-hub` (not main)

## 6. Safety

No destructive git commands. Only the label check, grounding reader/tests, and approve-preservation assertions — nothing outside these two items.
