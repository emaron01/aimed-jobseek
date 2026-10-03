# Cost per application, and how to compare models

This report lists every paid model call an application can trigger from the pasted posting through the Interview Cheat Sheet, and the read-only SQL that prices those calls from stored usage. It also documents the one-off comparison script. Nothing in this document changes application behavior.

Models have no code default. `getAiConfigForRole` reads the model with `readRequired` (`src/lib/ai/config.ts` line 315). The live model for a step is whatever that environment variable is set to on the service. The only recommendation in `.env.example` is `CONSULTATION_REPLY_AI_MODEL` = `gpt-5.6-luna` (line 234). Web search is on only for the research role (`src/lib/ai/providers/openai-responses.ts` line 150). Every other application step is structured output with web search off.

## Paid steps

Harper planning, reassessment, best-practice question selection, and the Cheat Sheet overview share `UsageEvent.operation = CONSULTATION` or are split below. Harper answer work shares `CONSULTATION_REPLY` and is split by `UsageEvent.metadata.step`. Several later steps share one usage operation and do not set `metadata.step`, so the SQL groups them together. The paid-call receipt operation (a different table) is named where it distinguishes them.

| Step | Usage operation | Receipt operation | Model env var | When it runs | Web search | Call |
| --- | --- | --- | --- | --- | --- | --- |
| Employer research | `RESEARCH_SYNTHESIS` | `COMPANY_RESEARCH` | `RESEARCH_AI_MODEL` | Seeker saves or refreshes a named employer. `ensureNamedEmployerResearch` (`src/lib/application/service.ts` line 264) enqueues a research run. The worker calls `researchCompany` (`src/lib/research/runs-service.ts` line 710). Seeker-initiated. | Yes. Responses `web_search`, capped at 3 searches (`MAX_EMPLOYER_RESEARCH_SEARCHES`, `src/lib/research/source-policy.ts` line 15). | `src/lib/research/provider.ts` line 253 |
| Job posting parse | `JOB_REQUIREMENT_PARSE` | `JOB_REQUIREMENT_PARSE` | `INTERPRETATION_AI_MODEL` | Seeker saves the posting (`saveApplicationJobPosting`, `src/lib/application/service.ts` line 1201). Seeker-initiated. | No | `src/lib/job-requirement/parse.ts` line 131 |
| Harper planning | `CONSULTATION`, `metadata.step = plan` | `CONSULTATION_PLAN` | `CONSULTATION_AI_MODEL` | Seeker starts or continues Harper. The consultation job runs the coach. Seeker-initiated. | No | `src/lib/consultation/ai.ts` line 207 |
| Harper reassessment | `CONSULTATION`, `metadata.step = reassess` | The model call uses `CONSULTATION_PLAN`. After it succeeds, a receipt is also stored as `CONSULTATION_LEARNINGS_REASSESS` or `CONSULTATION_SEEKER_BACKGROUND_REASSESS`. | `CONSULTATION_AI_MODEL` | Same coach call. Queued when learnings or seeker background change (`src/lib/consultation/learnings.ts` line 242, `src/lib/consultation/seeker-background-reassess.ts` line 94). The worker runs operation `reassess`. Not a separate button. | No | `src/lib/consultation/ai.ts` line 207 |
| Best-practice question selection | `CONSULTATION`, `metadata.step = role_expertise_questions` | `ROLE_EXPERTISE_QUESTIONS` | `CONSULTATION_AI_MODEL` | During Harper start or continue, when counted coaching questions are under 20. | No | `src/lib/consultation/role-expertise.ts` line 844 |
| Best-practice answers | `CONSULTATION_REPLY`, `metadata.step = role_expertise_answers` | `ROLE_EXPERTISE_ANSWERS` | `CONSULTATION_REPLY_AI_MODEL` | Immediately after question selection in the same Harper run. | No | `src/lib/consultation/role-expertise.ts` line 1129 |
| Ask Harper | `CONSULTATION_REPLY`, `metadata.step = role_expertise_answers` | `ROLE_EXPERTISE_ANSWERS` | `CONSULTATION_REPLY_AI_MODEL` | Seeker submits one question. `askHarper` (`src/lib/consultation/ask-harper.ts` line 139) uses the same answers step. Seeker-initiated. | No | `src/lib/consultation/role-expertise.ts` line 1129 |
| Answer extract | `CONSULTATION_REPLY`, `metadata.step = extract` | `CONSULTATION_EXTRACT` | `CONSULTATION_REPLY_AI_MODEL` | Seeker saves an answer. The worker runs the reply pipeline. Seeker-initiated. | No | `src/lib/consultation/ai.ts` line 289 |
| Answer polish | `CONSULTATION_REPLY`, `metadata.step = polish` | `CONSULTATION_POLISH` | `CONSULTATION_REPLY_AI_MODEL` | Same reply pipeline, after extract. | No | `src/lib/consultation/ai.ts` line 382 |
| Statement regeneration | `CONSULTATION_REPLY`, `metadata.step = statement_regeneration` | `CONSULTATION_STATEMENT_REGENERATE` | `CONSULTATION_REPLY_AI_MODEL` | Same polish call when the seeker regenerates a statement (`polishPaidOperation`, `src/lib/consultation/ai.ts` line 126). Seeker-initiated. | No | `src/lib/consultation/ai.ts` line 382 |
| Cheat Sheet overview | `APPLICATION_SUMMARY` | `APPLICATION_SUMMARY_SHELL` | `CONSULTATION_AI_MODEL` | Worker job `APPLICATION_SUMMARY` when the seeker generates the cheat sheet. Seeker-initiated. | No | `src/lib/application-summary/ai.ts` line 54 |
| Cheat Sheet person sections | `APPLICATION_SUMMARY` | `APPLICATION_SUMMARY_PERSON` | `CONSULTATION_REPLY_AI_MODEL` | Same cheat-sheet generation, once per person. Shares the usage operation with the overview, so the SQL cannot split them. | No | `src/lib/application-summary/ai.ts` line 121 |
| Presentation plan | `CONSULTATION`, `metadata.step = presentation_plan` | `PRESENTATION_PLAN` | `CONSULTATION_AI_MODEL` | Before the resume or cover letter, when the seeker works the plan. Usage is attached in `src/lib/application-assets/plan-service.ts` line 103. | No | `src/lib/application-assets/plan-ai.ts` lines 58 and 69 |
| Resume | `APPLICATION_ASSET_GENERATION` | `RESUME_ASSET` | `CONSULTATION_REPLY_AI_MODEL` | Seeker generates the resume. Shares this usage operation with the cover letter and with claim validation. | No | `src/lib/application-assets/ai.ts` line 107 |
| Cover letter | `APPLICATION_ASSET_GENERATION` | `COVER_LETTER_ASSET` | `CONSULTATION_REPLY_AI_MODEL` | Seeker generates the cover letter. | No | `src/lib/application-assets/ai.ts` line 144 |
| Resume and cover claim validation | `APPLICATION_ASSET_GENERATION` | `ASSET_CLAIM_VALIDATION` | `ASSET_AI_MODEL` | Automatic inside resume and cover generation. Temperature is forced to 0. | No | `src/lib/application-assets/ai.ts` line 334 |
| Outreach fact selection | `EMAIL_COMPANY_FACT_SELECTION` | `OUTREACH_FACT_SELECTION` | `EMAIL_FACTS_AI_MODEL` | Seeker generates an outreach message. | No | `src/lib/application-assets/ai.ts` line 195 |
| Outreach writing | `EMAIL_GENERATION` | `OUTREACH_ASSET` | `CONSULTATION_REPLY_AI_MODEL` | Email, LinkedIn note, or InMail in the same generation. Seeker-initiated. | No | `src/lib/application-assets/ai.ts` lines 255, 267, and 278 |
| Outreach claim validation | `APPLICATION_ASSET_GENERATION` | `OUTREACH_CLAIM_VALIDATION` | `ASSET_AI_MODEL` | Automatic inside outreach generation. Same validator as resume and cover claims. | No | `src/lib/application-assets/ai.ts` line 334 |
| Hiring Team identify | `HIRING_TEAM` | `HIRING_TEAM_IDENTIFY` | `PERSONA_AI_MODEL` | Seeker builds the hiring team, also queued after research finishes. Shares `HIRING_TEAM` with persona synthesis. | No | `src/lib/hiring-team/ai.ts` line 86 |
| Hiring Team persona synthesis | `HIRING_TEAM` | `HIRING_TEAM_SYNTHESIZE` | `PERSONA_AI_MODEL` | After identify, once per role. Structured only. Persona web search used elsewhere in the product is not this call. | No | `src/lib/hiring-team/ai.ts` line 169 |
| Interviewer fact extract | `CONTACT_PROFILE` | `CONTACT_PROFILE_EXTRACT` | `PERSONA_AI_MODEL` | Seeker pastes interviewer text. Shares `CONTACT_PROFILE` with profile synthesis. | No | `src/lib/contact-profile/extract.ts` line 99 |
| Individual profile synthesis | `CONTACT_PROFILE` | `CONTACT_PROFILE_SYNTHESIZE` | `PERSONA_AI_MODEL` | After the extract, for that person. | No | `src/lib/contact-profile/ai.ts` line 46 |
| Interviewer prep | `CONSULTATION`, `metadata.step = plan` | `CONSULTATION_PLAN` | `CONSULTATION_AI_MODEL` | Seeker prepares for one person. `src/lib/interview/person-prep.ts` line 81 enqueues consultation operation `person_prep`, which is the planning coach focused on that person. Not a separate model. Seeker-initiated. | No | `src/lib/consultation/ai.ts` line 207 |
| Thank-you clarifying questions | `APPLICATION_ASSET_GENERATION` (no step; shares this operation with resume, cover letter, and claim validation) | `INTERVIEW_THANK_YOU_CLARIFY` | `CONSULTATION_REPLY_AI_MODEL` | Seeker generates a thank-you note and the notes do not yet describe the conversation. Usage is attached in `src/lib/application-assets/outreach.ts` line 902. | No | `src/lib/interview/ai.ts` line 49 |
| Application next step | `APPLICATION_NEXT_STEP` | `APPLICATION_NEXT_STEP` | `CONSULTATION_REPLY_AI_MODEL` | Queued by `queueApplicationNextStepIfNeeded` (`src/lib/application/next-step.ts` line 255) after application state changes. Not a separate seeker button. | No | `src/lib/application/next-step.ts` line 144 |

Interview guide jobs (`INTERVIEW_GUIDE`) complete with no paid call (`src/lib/application-jobs/process.ts` line 251). Older `UsageEvent` rows with that operation can still appear in the SQL.

These paid roles are not on the posting-to-cheat-sheet path: contact scoring, contact role research, ICP interpretation, product research, persona web search, sequence email drafts, offer validation, and reply classification.

## Read-only SQL

Run this in the Render Postgres shell. It only selects.

**Which column holds each value**

- Application id: `UsageEvent.campaignId`. Application name: `Campaign.name`, joined on `Campaign.id`.
- Step: `UsageEvent.operation`. Harper substep: `UsageEvent.metadata` JSON key `step` (empty string when absent). A call’s model is `UsageEvent.model`. The provider string stored on the event is `UsageEvent.provider`. Rate lookup maps `openai-responses` and `openai-compatible` to provider `openai`, matching `billingProviderForRateLookup`.
- Calls: `COUNT(*)` of `UsageEvent` rows. Not a stored column.
- Input tokens: `UsageEvent.inputTokens`. Cached input tokens: `UsageEvent.cachedInputTokens`. Cache-write tokens: `UsageEvent.cacheWriteTokens`. Output tokens: `UsageEvent.outputTokens`. Web searches: `UsageEvent.webSearchCalls`.
- Cost is not stored. It is computed from `AiModelRate.inputPer1MUsd`, `cachedInputPer1MUsd`, `cacheWritePer1MUsd`, `outputPer1MUsd`, and `webSearchPerCallUsd` for the rate whose `effectiveFrom` is the latest at or before `UsageEvent.occurredAt`. Lookup order matches `resolveRate`: exact provider and model, then that provider with model `*` or `default`, then any provider with model `*` or `default`. The arithmetic matches `estimateEventCostUsd` (`src/lib/platform/cost.ts` lines 114–134): cached tokens are capped by input tokens, cache-write tokens are capped by the uncached remainder, and those cache-write tokens are not also billed as uncached input.
- Window: `UsageEvent.occurredAt` in the last 30 days, and `campaignId` is not null. Every status is included. Failed calls can still carry tokens.
- Average: `AVG` of the per-application cost, and `AVG` of the per-application-per-step cost. Median: `percentile_cont(0.5)` of those same sums. An application with no usage events in the window is absent.

```sql
WITH events AS (
  SELECT
    e."campaignId",
    c.name AS application_name,
    e.operation::text AS operation,
    COALESCE(e.metadata->>'step', '') AS step,
    e.model,
    e.provider,
    CASE
      WHEN lower(COALESCE(e.provider, '')) IN ('openai-responses', 'openai-compatible') THEN 'openai'
      ELSE lower(COALESCE(e.provider, ''))
    END AS billing_provider,
    COALESCE(e."inputTokens", 0) AS input_tokens,
    COALESCE(e."cachedInputTokens", 0) AS cached_input_tokens,
    COALESCE(e."cacheWriteTokens", 0) AS cache_write_tokens,
    COALESCE(e."outputTokens", 0) AS output_tokens,
    COALESCE(e."webSearchCalls", 0) AS web_searches,
    e."occurredAt"
  FROM "UsageEvent" e
  JOIN "Campaign" c ON c.id = e."campaignId"
  WHERE e."campaignId" IS NOT NULL
    AND e."occurredAt" >= NOW() - INTERVAL '30 days'
),
priced AS (
  SELECT
    ev.*,
    CASE
      WHEN rate.id IS NULL THEN 0::numeric
      ELSE (
        (ev.input_tokens - LEAST(GREATEST(ev.cached_input_tokens, 0), ev.input_tokens)
          - LEAST(
              GREATEST(ev.cache_write_tokens, 0),
              ev.input_tokens - LEAST(GREATEST(ev.cached_input_tokens, 0), ev.input_tokens)
            )
        )::numeric / 1000000 * rate."inputPer1MUsd"
        + LEAST(GREATEST(ev.cached_input_tokens, 0), ev.input_tokens)::numeric / 1000000 * rate."cachedInputPer1MUsd"
        + LEAST(
            GREATEST(ev.cache_write_tokens, 0),
            ev.input_tokens - LEAST(GREATEST(ev.cached_input_tokens, 0), ev.input_tokens)
          )::numeric / 1000000 * rate."cacheWritePer1MUsd"
        + ev.output_tokens::numeric / 1000000 * rate."outputPer1MUsd"
        + ev.web_searches::numeric * rate."webSearchPerCallUsd"
      )
    END AS cost_usd
  FROM events ev
  LEFT JOIN LATERAL (
    SELECT r.*
    FROM "AiModelRate" r
    WHERE r."effectiveFrom" <= ev."occurredAt"
      AND (
        (lower(r.provider) = ev.billing_provider AND r.model = ev.model)
        OR (lower(r.provider) = ev.billing_provider AND (r.model = '*' OR lower(r.model) = 'default'))
        OR (r.model = '*' OR lower(r.model) = 'default')
      )
    ORDER BY
      CASE
        WHEN lower(r.provider) = ev.billing_provider AND r.model = ev.model THEN 0
        WHEN lower(r.provider) = ev.billing_provider AND (r.model = '*' OR lower(r.model) = 'default') THEN 1
        WHEN r.model = '*' OR lower(r.model) = 'default' THEN 2
        ELSE 3
      END,
      r."effectiveFrom" DESC
    LIMIT 1
  ) rate ON true
),
per_step AS (
  SELECT
    "campaignId",
    application_name,
    operation,
    step,
    model,
    provider,
    COUNT(*)::int AS calls,
    SUM(input_tokens)::bigint AS input_tokens,
    SUM(cached_input_tokens)::bigint AS cached_input_tokens,
    SUM(cache_write_tokens)::bigint AS cache_write_tokens,
    SUM(output_tokens)::bigint AS output_tokens,
    SUM(web_searches)::bigint AS web_searches,
    SUM(cost_usd) AS cost_usd
  FROM priced
  GROUP BY "campaignId", application_name, operation, step, model, provider
),
per_application AS (
  SELECT "campaignId", application_name, SUM(cost_usd) AS cost_usd
  FROM per_step
  GROUP BY "campaignId", application_name
),
per_application_step AS (
  SELECT "campaignId", operation, step, SUM(cost_usd) AS cost_usd
  FROM per_step
  GROUP BY "campaignId", operation, step
)
SELECT * FROM (
  SELECT
    'step'::text AS report,
    "campaignId",
    application_name,
    operation,
    step,
    model,
    provider,
    calls,
    input_tokens,
    cached_input_tokens,
    cache_write_tokens,
    output_tokens,
    web_searches,
    cost_usd,
    NULL::numeric AS average_cost_usd,
    NULL::numeric AS median_cost_usd
  FROM per_step
  UNION ALL
  SELECT
    'application_average_and_median',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL,
    (SELECT AVG(cost_usd) FROM per_application),
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY cost_usd) FROM per_application)
  UNION ALL
  SELECT
    'step_average_and_median',
    NULL, NULL, operation, step, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL,
    AVG(cost_usd),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY cost_usd)
  FROM per_application_step
  GROUP BY operation, step
) rows
ORDER BY report, application_name, operation, step, model;
```

## Comparison script

Run it from the Render shell for the **web** service. Environment variables are already set. Do not pass a dotenv file. `tsx` is a dev dependency on the service image used for the research worker; the same condition makes `server-only` resolve.

```text
tsx --conditions=react-server scripts/compare-models.ts --campaign <campaignId> [--steps planning,questions,cheatsheet,research] [--dry-run]
```

`--steps` defaults to all four. `--dry-run` prints the inputs and a $0 token cost and does not call a model.

The script loads the application with `prisma.campaign.findUnique` (`src/lib/model-comparison/compare.ts` line 161). It then builds each step with the production builders:

- Planning: `buildConsultationCoachMessagesForCampaign` (`src/lib/consultation/service.ts` line 1811), which calls `buildConsultationCoachMessages`.
- Best-practice questions: `roleExpertiseQuestionMessages` (`src/lib/consultation/role-expertise.ts` line 302), which calls `buildRoleExpertiseQuestionsMessages`. If counted questions are already at least 20, the step is skipped and no model is called.
- Cheat Sheet overview: `applicationSummaryShellModelMessages` (`src/lib/application-summary/service.ts` line 251), which calls `buildApplicationSummaryGuidanceMessages` in shell mode.
- Employer research: the same `CompanyResearchInput` shape `researchCompany` uses (`compare.ts` line 270), including the website anchor, posting, seeker notes, and depth. Depth is read with `researchPolicy.findUnique` (line 292). If no policy row exists, the code uses `DEFAULT_RESEARCH_POLICY_VALUES` and does not insert one. The run then uses `AiCompanyResearchProvider` (`src/lib/research/provider.ts` line 147) so coverage rules and the 3-search cap stay in production code.

Each selected step runs twice, once with `gpt-5.6-terra` and once with `gpt-5.6-luna`. Structured steps call `createAiProvider({ ...config, model })` (`compare.ts` line 385) and omit `usage`, so the provider does not write a `UsageEvent`. Research passes `{ model, recordUsage: false }` (`compare.ts` line 565). The provider then skips `aiCallTracking` (`provider.ts` line 256). The script does not call `runPaidStructuredCall`, `researchCompany`, `requireApplication`, or `getResearchPolicy`. Nothing is enqueued. Usage in the report comes from the provider response (`compare.ts` lines 390 and 570). Cost uses `estimateEventCostUsd` and `listAiModelRates` (a `findMany` only).

The Markdown is built in `renderMarkdown` (`compare.ts` line 595) and written to stdout and to `model-comparison-<campaignId>-<timestamp>.md` in the working directory (`compare.ts` line 735).

### Estimated cost of one full run

A dry run’s token cost is $0. It also prints the research web-search ceiling: 3 times the stored `webSearchPerCallUsd` for each model. At the seed rate that ceiling is $0.03 per model.

A live run of all four steps, both models, is not a fixed bill. At the seed rates in `SEED_AI_MODEL_RATES` (`src/lib/platform/model-rates.ts` lines 19–39), and assuming no cache and these token sizes, the estimate is about **$0.30** for both models together:

| Step | Assumed input / output | Terra | Luna |
| --- | --- | --- | --- |
| Planning | 12,000 / 1,500 | $0.042 | $0.004 |
| Questions | 8,000 / 1,200 | $0.030 | $0.003 |
| Cheat Sheet overview | 10,000 / 1,200 | $0.034 | $0.003 |
| Research, two stages, plus 3 searches | 30,000 / 4,000 | $0.138 | $0.041 |
| Total |  | about $0.24 | about $0.05 |

Terra is $2 / 1M input and $12 / 1M output. Luna is $0.20 / 1M input and $1.20 / 1M output. Web search is $0.01 per call at the seed rate. Research dominates, and a run that stops before three searches costs less. The live report prices the actual provider token counts at the rates stored in `AiModelRate`.
