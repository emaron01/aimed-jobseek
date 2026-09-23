# Hiring Team model identification, draft fixes, and secret check

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

Work on main. Commit and push when all checks pass. Do these in order.

PART A: Secret exposure check (report first, before any other change)
Search the entire git history of this repository (all branches, all commits, including history inherited from the fork) for committed secrets: .env.example contents, API keys (sk-, sk-proj-, sk_live, sk_test, whsec_), database URLs with passwords, SMTP passwords, and auth secrets. Report each file, commit, and credential type found, with values redacted, and whether that commit was pushed to origin. Do not rewrite history. Add a test or pre-commit check that fails if .env.example contains anything other than empty or clearly placeholder values.

PART B: Model-driven Hiring Team identification
The model identifies the Hiring Team, exactly as product synthesis identified suggestedBuyerRoles. Product code only enforces guardrails.
- Remove INDIRECT_SIGNALS and every hardcoded role name, title, department, and regex role detector from src/lib/hiring-team/identify.ts. Remove the code-written whyInvolved templates.
- The model returns all roles (direct and indirect) with name, likely titles, department, involvement, why involved, and evidence.
- Guardrails in product code:
  - When the posting states a reporting line, exactly one Hiring Manager role must exist and its first likely title must be that reporting line. If the model omits it or uses another title, correct the title and record the correction; do not write narrative.
  - Grounding: each role's why-involved must be supported by the job requirement or company research; unsupported roles are dropped and recorded.
  - Deduplication by meaning, not slug: roles describing the same person (for example, "Reliability Lead" and "Reliability lead", or "Robotics Lead" and "Motion Planning Technical Lead" when they describe the same function) merge into one. Keep stable identity so research updates modify the same rows.
  - A sensible maximum number of roles, from configuration.
- Tests with real-model-free fixtures of MODEL OUTPUT (not product-code detection) cover: reporting-line enforcement, grounding drops, semantic dedupe, stable identity on update. Add fixture postings from at least two unrelated fields (for example, a nurse manager and a financial controller) to prove no domain-specific logic remains in code.

PART C: Draft fixes
- Strip "FACT:" and "INFERENCE:" prefixes from narrative text; kind is stored separately. Instruct the model not to write them.
- Interview stage for a Hiring Manager defaults to the hiring manager chronological walk-through unless the posting or research states otherwise.
- Personas must never mention internal system state (research status, ambiguity, confidence, missing data). Add a draft-quality check that rejects such references and retries.

REPORT
Part A findings first. Then real model output (actual model calls) for identification and the Hiring Manager draft on the normal fixture posting, plus identification output for the nurse manager and financial controller fixtures. Prompt versions, files changed, and anything that could not meet this standard.
