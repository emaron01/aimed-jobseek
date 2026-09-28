# Prompt: Implement shared paid-call guard — Phase 1 hiring team

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Implement the approved Phase 1 plan (docs/prompts/paid-call-guard-phase1-hiring-team-plan.md) with the product owner's changes below. One shared mechanism, no per-call-site patches, no temporary fixes, no data repair, no backfill or migration of existing data. Schema additions (new table, new index) are allowed as specified.

SURGICAL RULE
Wire the gate ONLY to hiring identify and hiring synthesize. Every other paid call stays exactly as it is. Do not change prompts, models, persona content, UI layout, or any behavior not listed here. Add no features.

PRODUCT OWNER CHANGES TO THE PLAN (these override the plan where they differ)

CHANGE 1: Synthesize fingerprint uses sibling identity only.
CHANGE 2: Skip before queuing, with seeker message "No Changes To {role name} Persona".
CHANGE 3: Verify the active-job unique index against every job type BEFORE creating it.

IMPLEMENT / TESTS / REPORT as specified in the user message.
