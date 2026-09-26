Implement AI cost reduction ONLY in C:\Repos\aimed-jobseek (origin https://github.com/emaron01/aimed-jobseek.git). Confirm repo and remote before any change. Never touch any other repository. Work on main. Commit and push when all checks pass. Change nothing else.

FIRST ACTION: Save this user prompt verbatim to docs/prompts/reduce-ai-cost.md (or similar). Then implement.

PRODUCTION STANDARD
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK
Reduce AI cost. gpt-5.6-terra is 10x gpt-5.6-luna ($2 vs $0.20 / 1M input, $12 vs $1.20 output). Nearly every job-seeker operation is on Terra. Job-seeker generation records no token usage today.

1. Record token usage on every AI call
Every model call records a UsageEvent: operation, application (campaignId), model, input tokens, cached input tokens, output tokens, duration, and cost at the rates in the AI model rate table (AiModelRate). Show it on the platform admin costs page by operation and per application.

Existing pieces (use them; extend, do not invent a parallel system):
- prisma UsageEvent, UsageOperation, AiModelRate, ProviderSpendReconciliation
- src/lib/usage/events-service.ts recordUsageEvent
- src/lib/platform/cost.ts, src/lib/platform/model-rates.ts
- src/lib/ai/providers/openai-responses.ts — today it does NOT parse cached_tokens from Responses usage.input_tokens_details.cached_tokens and job-seeker generators never call recordUsageEvent
- CONSULTATION is not even a Prisma UsageOperation — add whatever operations are needed so Harper/assets/next-step/etc. can be recorded
- Cost estimator currently has no cached-input rate — add it using the rate table (Terra cached $0.20/1M, Luna $0.02/1M; cache writes are 1.25x uncached input per OpenAI)
- Platform admin costs page: find and extend it to show by operation and per application

2. Writing on the cheaper model
- Outreach emails, LinkedIn connection notes, InMails, thank-yous, and check-ins use the communications roles EMAIL_AI and EMAIL_FACTS_AI, as Aimed Outreach does. Look at how Aimed Outreach is wired in this repo (or shared AI config) and reuse that pattern — do not invent new role names.
- Resume and cover letter stay on the ASSET_AI role, so their model is chosen by configuration (ASSET_AI_MODEL) without code changes.

3. Harper on two models
- Heavy work, once per application, stays on CONSULTATION_AI: "Where you stand", the evidence assessment, and drafting the questions (planConsultationWithModel / planAndStoreRound).
- Per-answer work moves to a new role, CONSULTATION_REPLY_AI, following the existing AI role pattern in src/lib/ai/config.ts: reading the seeker's answer, the optional follow-up, and writing the resume bullet and talking point (extract + polish).
- Add CONSULTATION_REPLY_AI_MODEL (and any matching key/base/reasoning env vars the other roles have). Recommended model for the report: gpt-5.6-luna.

4. Next-step card on the cheaper model
The next-step card uses CONSULTATION_REPLY_AI (src/lib/application/next-step.ts currently uses getConsultationAiProvider).

5. Caching and context
- Order every prompt so repeated content for the same application comes first: system instructions, then Personal Profile, job requirement, and research; call-specific content last, so OpenAI prompt caching applies.
- Add a prompt cache key per application (Responses prompt_cache_key).
- Send each call only the context it needs; stop sending the full shared payload (commonPayload in application-assets) to calls that do not use it.
- Harper extract/polish should not get the full hiring-team personaContext / unused shared blob. Resume should not get unused persona narratives if it does not use them. Next-step already only needs state — keep it small but still put a stable prefix first if there is one.

Also: every generateStructured path (research, profile, job parse, hiring team, contact profile, Harper, resume, cover, outreach, interview, cheat sheet, next-step, claim validation) must record usage. Parse cached_tokens from the Responses API.

TESTS
- Usage events recorded on model calls with operation, campaign, model, input, cached input, output, duration, cost.
- Admin costs page shows by operation and per application.
- Outreach uses EMAIL_AI / EMAIL_FACTS_AI.
- Resume/cover still use ASSET_AI.
- Harper plan uses CONSULTATION_AI; extract/polish and next-step use CONSULTATION_REPLY_AI.
- Prompts order shared prefix first; prompt_cache_key is per application.
- Calls do not send unused full shared payloads.
- Full vitest, eslint --max-warnings=0, tsc --noEmit, next build all pass.

MEASURE LOCALLY (worker running) for the REPORT:
- Before-and-after token counts for one Harper answer and one resume generation.
- Cached-token results on a second call of the same operation.
If you cannot get a live before measurement (this change is the first time usage is recorded), measure after the change and compare two successive calls (first vs cached second). Be honest about what was measured.

REPORT (return this in your final message):
- Usage events recorded (what fields, which operations)
- Each operation's role and model after the change
- New environment variables to add in Render (names + recommended model for CONSULTATION_REPLY_AI)
- Before-and-after token counts for one Harper answer and one resume generation, measured locally
- Cached-token results on a second call
- Files changed
- Full-suite result
- Commit hash and that it was pushed to main

Do not over-engineer. Change nothing else. Windows PowerShell: use ; not &&.

Prior cost-report findings you can trust:
- UsageEvent empty; job-seeker gens never recordUsageEvent
- openai-responses.ts does not read cached_tokens
- CONSULTATION not in UsageOperation enum
- cost.ts has no cached-input rate
- Models: CONSULTATION/ASSET/INTERPRETATION/RESEARCH = gpt-5.6-terra default medium; PRODUCT/PERSONA = gpt-5.6-luna low
- commonPayload dumps application+job+research+persona+assessments+statements+stories+voice+all sources into user JSON
- No prompt_cache_key today; system first, user JSON second
- Next-step uses getConsultationAiProvider
- extract/polish in consultation/ai.ts use getConsultationAiProvider
- Outreach generateOutreachWithModel uses asset AI today
