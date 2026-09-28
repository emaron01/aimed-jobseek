# Harper Batch C — two-item fixes report

**Repo:** `C:/Repos/aimed-jobseek` → `origin` `https://github.com/emaron01/aimed-jobseek.git`  
**Branch:** `checkpoint/harper-prep-hub`  
**Prompt saved:** `docs/prompts/harper-batch-c-two-item-fixes.md`  
**Aimed Outreach:** not read or touched.

---

## 1. ITEM 1 — Never delete approved answers

**Before:** `finishItemNeedsMoreDetail` (`service.ts` **812–818**) called `consultationStatement.deleteMany` for `kind in [INTERVIEW_ANSWER, RESUME_BULLET]` on `turnId in [resultTurnId, ...supersedeTurnIds]` with **no status filter**. That deleted every Harper result on the failed reply turn **and** on prior seeker turns for the same card — including **APPROVED** statements from earlier successful runs, and any **DRAFT** from the failed attempt (usually none yet, since upsert runs only after polish succeeds).

**After (`service.ts` ~788–828):** deletes only `status: "DRAFT"` on `turnId: input.resultTurnId` (the failed attempt’s reply turn). Prior turns (`supersedeTurnIds`) are untouched. APPROVED statements stay. Session stays READY.

**UI (`ConsultationThread.tsx`):** needs-more-detail copy shows whenever `item.needsMoreDetail`, including when an approved result is already shown.

---

## 2. ITEM 2 — Real CSC posting fixture

Fixture replaced with the real CSC Global Senior Director of Sales - North America items.

### Pitch / evidenceTargets

**Excluded by pitch (`looksLikeCompanyPitch` / skip in `evidenceTargets`):**
- Mission: “Join us to help protect the world's most valuable digital brands…”
- Fifth outcome (mission echo): “Build a disciplined, world-class sales organization defined by execution excellence, leadership depth, and sustainable growth.” — **yes, excluded** (matches `defined by execution excellence` marker).

**Kept by pitch (not company pitch):**
- All 12 responsibilities (including “Position … as mission-critical controls…”)
- All 7 required items
- First four outcomes
- All 6 competencies

**evidenceTargets note (not pitch):** third outcome “Improve seller productivity…” shares meaning with a required item and is not a separate target; competencies share meaning with required and are not separate targets. No pitch-rule change required.

---

## 3. Files changed

- `docs/prompts/harper-batch-c-two-item-fixes.md`
- `docs/prompts/harper-batch-c-two-item-fixes-report.md`
- `src/lib/consultation/service.ts`
- `src/components/ConsultationThread.tsx`
- `src/lib/consultation/csc-senior-director-sales-fixture.ts`
- `src/lib/consultation/harper-batch-c.test.ts`

---

## 4. Tests

**Updated:** FIX 3 assertions (DRAFT-only delete; message with approved); FIX 5 real posting expectations; new view test for approved + failed reply.

**Existing changed:** only `harper-batch-c.test.ts` (these two items).

| Check | Result |
|-------|--------|
| `npm test` | **1910 passed**, 256 files |
| `npm run build` | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | **0 errors** (2 pre-existing warnings in `scripts/step0-assess-hiring-team-drafts.ts`) |

---

## 5. Commit / branch

- **Branch:** `checkpoint/harper-prep-hub` (not merged to main)  
- **Commit:** *(filled after commit)*

---

## 6. Scope confirmation

Only these two items (approved-safe polish failure cleanup + real CSC fixture/tests). Nothing else.
