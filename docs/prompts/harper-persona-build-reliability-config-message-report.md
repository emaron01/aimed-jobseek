# REPORT — Persona config seeker message + non-blocking startup log

Repo: `C:/Repos/aimed-jobseek` · remote: `https://github.com/emaron01/aimed-jobseek.git`

## 1. What the assert did before

| Surface | Before |
|---------|--------|
| **Web** (`instrumentation.ts` `register()`, production only) | Called `assertPersonaAiConfigured()` which called `getPersonaAiConfig()` → **threw** `AiConfigError` if env missing → **stopped web boot** |
| **Worker** (`scripts/research-worker.ts`) | Logged `persona_ai_configuration_missing` via `console.error` when missing; **then** in production called `assertPersonaAiConfigured()` which **threw** → **stopped worker boot** |

Neither exited via `process.exit`; both stopped by uncaught throw.

## 2. What changed

**ITEM 1** — `src/lib/hiring-team/build.ts` (~570): seeker `TenantError` message is now exactly:
`Personas can't be built right now. Please try again shortly.`

**ITEM 2** — `src/lib/ai/config.ts` `assertPersonaAiConfigured` (~503–512): if not configured, `console.error` JSON `{ event: "persona_ai_configuration_missing", severity: "operational", ... }` and **return**; never throws.  
- `src/instrumentation.ts` (~21): still calls it on production web boot (log only).  
- `scripts/research-worker.ts` (~88): single `assertPersonaAiConfigured()` call (removed duplicate log + production throw).

## 3. Files changed

- `docs/prompts/harper-persona-build-reliability-config-message.md` (prompt)
- `docs/prompts/harper-persona-build-reliability-config-message-report.md` (this report)
- `src/lib/hiring-team/build.ts`
- `src/lib/ai/config.ts`
- `src/instrumentation.ts`
- `scripts/research-worker.ts`
- `src/lib/ai/config.test.ts`
- `src/lib/hiring-team/build-reliability.test.ts`

## 4. Tests + suite

Updated: seeker message exact text + no system language; assert logs operational error and does not throw; configured path logs nothing; web/worker still call assert.

**Full suite:** `npx vitest run` → **245 files, 1815 passed**. Real-Postgres describes ran (not skipped).

## 5. Scope

Only ITEM 1 message and ITEM 2 non-blocking startup log. Nothing else changed.
