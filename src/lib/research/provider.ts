import {
  getResearchAiConfig,
  getResearchAiProvider,
  isResearchAiConfigured,
} from "@/lib/ai";
import { createAiProvider } from "@/lib/ai/provider";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import {
  AiConfigError,
  AiProviderError,
  AiTimeoutError,
  AiValidationError,
} from "@/lib/ai/errors";
import { RESEARCH_PROMPT_VERSION } from "@/lib/research/config";
import { aiCallTracking } from "@/lib/usage/ai-call";
import {
  evidenceFromNormalizedSources,
  mergeEvidenceBundles,
} from "@/lib/research/evidence";
import { finalizeResearchSources } from "@/lib/research/finalize-sources";
import { cleanResearchForSave } from "@/lib/research/research-prose";
import {
  anchorHostEvidenceEnough,
  coverageSearchFocus,
  employerSearchBudget,
  jobFocusDetailCovered,
  missingHighlightTopics,
  shouldRunAnotherEmployerSearch,
  topicsAddressedBySearchFocus,
  type CoverageEvidenceInput,
  type HighlightCoverageTopic,
} from "@/lib/research/source-policy";
import { buildCompanyResearchMessages } from "@/lib/research/prompt";
import { appendSeekerSuppliedResearchEvidence } from "@/lib/research/seeker-supplied-notes";
import {
  fetchJobFocusPageFromHomepage,
  getCompanySourceRetriever,
  hasFirstPartyWebsiteEvidence,
} from "@/lib/research/sources";
import {
  categorizeResearchError,
  logResearchTelemetry,
} from "@/lib/research/telemetry";
import type {
  CompanyResearchInput,
  CompanyResearchProvider,
  CompanyResearchResult,
  CompanyResearchProvenance,
  ResearchSource,
  ResearchStageTiming,
  ResearchStoppedReason,
} from "@/lib/research/types";
import {
  assertResearchConfidenceAllowed,
  validateCompanyResearchResult,
} from "@/lib/research/validate";
import { evaluateWebsiteFirstSufficiency } from "@/lib/research/website-first-sufficiency";
import {
  shouldSkipWebsiteOnlySynthesis,
  WEBSITE_FETCH_UNAVAILABLE_FOCUS,
} from "@/lib/research/provider-routing";
import { DEFAULT_RESEARCH_POLICY_VALUES } from "@/lib/usage/defaults";

export type ResearchUsageSnapshot = {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens?: number | null;
  cacheWriteTokens?: number | null;
  webSearchCallCount: number | null;
  researchDurationMs: number | null;
};

/**
 * Optional per-run overrides. Omitted fields keep production behavior:
 * RESEARCH_AI_MODEL and a UsageEvent row for each stage.
 */
export type CompanyResearchRunOptions = {
  /** This run only. Does not change RESEARCH_AI_MODEL. */
  model?: string;
  /** When false, stage responses are not stored as UsageEvent rows. Default true. */
  recordUsage?: boolean;
};

export type AutomatedCompanyResearchResult = CompanyResearchResult & {
  provenance: CompanyResearchProvenance;
  usage?: ResearchUsageSnapshot;
  identityAmbiguous?: boolean;
  searchStagesUsed?: number;
  /** Telemetry only — true when strict website gate would have skipped search (prefetch never stops). */
  websitePrefetchGatePass?: boolean;
  stoppedReason?: ResearchStoppedReason;
  stageTimings?: ResearchStageTiming[];
  /** Sister domains linked from the anchor host. Stored in research timings. */
  sisterHosts?: string[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AiTimeoutError) return true;
  if (error instanceof AiProviderError) return error.retryable;
  return false;
}

async function withRetries<T>(
  fn: () => Promise<T>,
  maxRetries: number,
): Promise<{ value: T; retries: number }> {
  let attempt = 0;
  while (true) {
    try {
      return { value: await fn(), retries: attempt };
    } catch (error) {
      if (
        error instanceof AiValidationError ||
        error instanceof AiConfigError
      ) {
        throw error;
      }
      if (!isRetryable(error) || attempt >= maxRetries) throw error;
      const delay = Math.min(2000 * 2 ** attempt, 8000);
      await sleep(delay);
      attempt += 1;
    }
  }
}

function dedupeSources(sources: ResearchSource[]): ResearchSource[] {
  const seen = new Set<string>();
  const out: ResearchSource[] = [];
  for (const s of sources) {
    const key = s.url.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Progressive evidence acquisition:
 * Known data → website prefetch, including a job-focus page linked from the
 * homepage → web search until the brief is covered or the search cap is hit.
 *
 * When first-party fetch returns nothing (403, empty), skip prefetch synthesis
 * and start with web_search immediately.
 */
export class AiCompanyResearchProvider implements CompanyResearchProvider {
  constructor(private readonly runOptions: CompanyResearchRunOptions = {}) {}

  async research(
    input: CompanyResearchInput,
  ): Promise<AutomatedCompanyResearchResult> {
    const started = Date.now();
    const config = getResearchAiConfig();
    const explicitModel = this.runOptions.model?.trim() || "";
    const model = explicitModel || config.model;
    const recordUsage = this.runOptions.recordUsage !== false;
    let retries = 0;
    let totalInputTokens: number | null = null;
    let totalOutputTokens: number | null = null;
    let totalCachedInputTokens: number | null = null;
    let totalCacheWriteTokens: number | null = null;
    let totalWebSearchCalls = 0;
    let searchStagesUsed = 0;
    const stageTimings: ResearchStageTiming[] = [];
    let stoppedReason: AutomatedCompanyResearchResult["stoppedReason"] =
      "no_web_search";

    const depth = input.depthPolicy ?? {
      maxSearchQueriesPerCompany:
        DEFAULT_RESEARCH_POLICY_VALUES.maxSearchQueriesPerCompany,
      maxSourcesPerCompany: DEFAULT_RESEARCH_POLICY_VALUES.maxSourcesPerCompany,
      researchFreshnessDays:
        DEFAULT_RESEARCH_POLICY_VALUES.researchFreshnessDays,
    };

    try {
      const ai = explicitModel
        ? createAiProvider({ ...config, model: explicitModel })
        : getResearchAiProvider();
      const retriever = getCompanySourceRetriever();
      const websiteEvidence = await retriever.retrieve(input);
      const homepageHtml = websiteEvidence.homepageHtml ?? null;
      const homepageUrl = websiteEvidence.homepageUrl ?? null;
      const webSearchAvailable = config.provider === "openai-responses";
      const hasFirstPartyEvidence =
        hasFirstPartyWebsiteEvidence(websiteEvidence);
      const skipWebsiteOnlySynthesis = shouldSkipWebsiteOnlySynthesis({
        hasFirstPartyEvidence,
        webSearchAvailable,
      });
      const websiteExcerptText = websiteEvidence.excerpts
        .map((excerpt) => excerpt.text)
        .join("\n");

      let evidence = appendSeekerSuppliedResearchEvidence(
        websiteEvidence,
        input.seekerSuppliedNotes,
      );
      let lastValidated: CompanyResearchResult | null = null;
      let identityAmbiguous = false;
      let current: CompanyResearchResult | undefined;
      let websitePrefetchGatePass: boolean | undefined;

      const maxQueries = employerSearchBudget(depth.maxSearchQueriesPerCompany);
      const postingProvided = Boolean(
        input.postingTitle?.trim() ||
          input.postingUrl?.trim() ||
          input.postingText?.trim(),
      );
      const searchedTopics = new Set<HighlightCoverageTopic>();
      const coverageInput = (
        result: CompanyResearchResult | undefined,
      ): CoverageEvidenceInput => ({
        anchorHost: input.normalizedDomain,
        sources: result?.sources ?? [],
        excerpts: evidence.excerpts,
        companySummary: result?.companySummary ?? null,
        whatTheySell: result?.whatTheySell ?? null,
        businessModel: result?.businessModel ?? null,
        companySizeContext: result?.companySizeContext ?? null,
        jobFocus: result?.jobFocus ?? null,
        jobFocusDetail: result?.jobFocusDetail ?? null,
        postingProvided,
        postingText: input.postingText,
        topicsRecordedNotFound: [...searchedTopics],
      });
      const evidenceEnough = (result: CompanyResearchResult | undefined) =>
        Boolean(result && anchorHostEvidenceEnough(coverageInput(result)));
      const recordSearchedTopics = (focus: string) => {
        for (const topic of topicsAddressedBySearchFocus(focus)) {
          searchedTopics.add(topic);
        }
      };
      const nextSearchFocus = (result: CompanyResearchResult | undefined) => {
        const snapshot = coverageInput(result);
        return coverageSearchFocus({
          missingTopics: missingHighlightTopics(snapshot),
          jobFocus: result?.jobFocus ?? null,
          needJobFocusPage: postingProvided && !jobFocusDetailCovered(snapshot),
        });
      };

      const runStage = async (opts: {
        stage: "initial" | "follow_up";
        searchFocus?: string | null;
        searchesRemaining: number;
        webSearchEnabled: boolean;
      }): Promise<CompanyResearchResult> => {
        const stageStarted = Date.now();
        const { value: response, retries: usedRetries } = await withRetries(
          () =>
            ai.generateStructured({
              ...structuredOutputRequest("companyResearch"),
              webSearchEnabled: opts.webSearchEnabled,
              ...(recordUsage
                ? aiCallTracking({
                    organizationId: input.organizationId,
                    userId: input.userId ?? null,
                    campaignId: input.campaignId ?? null,
                    companyId: input.companyId,
                    category: "RESEARCH",
                    operation: "RESEARCH_SYNTHESIS",
                  })
                : {}),
              messages: buildCompanyResearchMessages({
                company: input,
                evidence,
                webSearchEnabled: opts.webSearchEnabled,
                firstPartyFetchUnavailable:
                  skipWebsiteOnlySynthesis && opts.webSearchEnabled,
                searchFocus: opts.searchFocus,
                stage: opts.stage,
                searchesRemaining: opts.searchesRemaining,
              }),
            }),
          config.maxRetries,
        );
        retries += usedRetries;
        searchStagesUsed += 1;
        stageTimings.push({
          stage: opts.stage,
          webSearchEnabled: opts.webSearchEnabled,
          durationMs: Date.now() - stageStarted,
        });

        if (response.usage?.inputTokens != null) {
          totalInputTokens =
            (totalInputTokens ?? 0) + response.usage.inputTokens;
        }
        if (response.usage?.outputTokens != null) {
          totalOutputTokens =
            (totalOutputTokens ?? 0) + response.usage.outputTokens;
        }
        if (response.usage?.cachedInputTokens != null) {
          totalCachedInputTokens =
            (totalCachedInputTokens ?? 0) + response.usage.cachedInputTokens;
        }
        if (response.usage?.cacheWriteTokens != null) {
          totalCacheWriteTokens =
            (totalCacheWriteTokens ?? 0) + response.usage.cacheWriteTokens;
        }
        if (opts.webSearchEnabled) {
          if (response.usage?.webSearchCalls != null) {
            totalWebSearchCalls += response.usage.webSearchCalls;
          } else {
            totalWebSearchCalls += 1;
          }
        }

        const webEvidence = evidenceFromNormalizedSources(
          response.retrievedSources ?? [],
        );
        evidence = mergeEvidenceBundles(evidence, webEvidence);

        const validated = validateCompanyResearchResult(
          response.data,
          evidence,
          { postingText: input.postingText },
        );
        assertResearchConfidenceAllowed(validated);
        const next: CompanyResearchResult = {
          ...validated,
          sources: dedupeSources(validated.sources),
        };
        lastValidated = next;
        identityAmbiguous = response.data.identityCertainty === "AMBIGUOUS";
        return next;
      };

      const runWebSearchStages = async (
        initialFocus: string,
        firstStage: "initial" | "follow_up",
      ): Promise<void> => {
        if (
          !shouldRunAnotherEmployerSearch({
            searchesUsed: totalWebSearchCalls,
            budget: maxQueries,
            enough: evidenceEnough(current),
          })
        ) {
          stoppedReason = evidenceEnough(current) ? "sufficient" : "max_queries";
          return;
        }

        current = await runStage({
          stage: firstStage,
          searchFocus: initialFocus,
          searchesRemaining: Math.max(0, maxQueries - totalWebSearchCalls),
          webSearchEnabled: true,
        });
        recordSearchedTopics(initialFocus);

        while (
          shouldRunAnotherEmployerSearch({
            searchesUsed: totalWebSearchCalls,
            budget: maxQueries,
            enough: evidenceEnough(current),
          })
        ) {
          const focus = nextSearchFocus(current);
          current = await runStage({
            stage: "follow_up",
            searchFocus: focus,
            searchesRemaining: Math.max(0, maxQueries - totalWebSearchCalls),
            webSearchEnabled: true,
          });
          recordSearchedTopics(focus);
        }

        stoppedReason = evidenceEnough(current) ? "sufficient" : "max_queries";
      };

      if (!webSearchAvailable) {
        current = await runStage({
          stage: "initial",
          searchesRemaining: 0,
          webSearchEnabled: false,
        });
        stoppedReason = "no_web_search";
      } else if (skipWebsiteOnlySynthesis) {
        await runWebSearchStages(
          `${WEBSITE_FETCH_UNAVAILABLE_FOCUS} ${nextSearchFocus(current)}`,
          "initial",
        );
      } else {
        current = await runStage({
          stage: "initial",
          searchesRemaining: maxQueries,
          webSearchEnabled: false,
        });
        if (
          current.jobFocus?.trim() &&
          homepageHtml &&
          homepageUrl &&
          !jobFocusDetailCovered(coverageInput(current))
        ) {
          const extra = await fetchJobFocusPageFromHomepage({
            html: homepageHtml,
            pageUrl: homepageUrl,
            anchorHost: input.normalizedDomain,
            subject: current.jobFocus,
            skipUrls: evidence.sources.map((source) => source.url),
          });
          if (extra && extra.excerpts.length > 0) {
            evidence = mergeEvidenceBundles(evidence, extra);
            current = await runStage({
              stage: "initial",
              searchesRemaining: maxQueries,
              webSearchEnabled: false,
            });
          }
        }

        const websiteGate = evaluateWebsiteFirstSufficiency({
          websiteExcerptText,
          sources: current.sources,
          fields: current,
        });
        websitePrefetchGatePass = websiteGate.sufficient;

        if (evidenceEnough(current)) {
          stoppedReason = "website_sufficient";
        } else {
          await runWebSearchStages(nextSearchFocus(current), "follow_up");
        }
      }

      // Prefer the latest stage result (`current`); `lastValidated` is only a
      // defensive mirror because TS does not track assignments inside runStage.
      const validatedResult = current ?? lastValidated;
      if (!validatedResult) {
        throw new AiValidationError("Research produced no validated result.");
      }

      const sisterHosts = websiteEvidence.sisterHosts ?? [];
      const finalizedSources = finalizeResearchSources({
        sources: validatedResult.sources,
        companyWebsiteUrl: input.website,
        companyDomain: input.normalizedDomain,
        companyName: input.name,
        jobFocus: validatedResult.jobFocus,
        excerpts: evidence.excerpts,
        sisterHosts,
        maxSources: depth.maxSourcesPerCompany,
      });

      const finalized = cleanResearchForSave(
        {
          ...validatedResult,
          sources: finalizedSources,
        },
        {
          anchorHost: input.normalizedDomain,
          sisterHosts,
        },
      );

      const result: AutomatedCompanyResearchResult = {
        ...finalized,
        ...(identityAmbiguous
          ? {
              confidence: "LOW" as const,
              companySummary:
                finalized.companySummary ??
                "Company identity is ambiguous; research is incomplete.",
            }
          : {}),
        provenance: {
          aiProvider: config.provider,
          aiModel: model,
          aiModelUrlIdentifier: config.modelUrlIdentifier,
          promptVersion: RESEARCH_PROMPT_VERSION,
        },
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cachedInputTokens: totalCachedInputTokens,
          cacheWriteTokens: totalCacheWriteTokens,
          webSearchCallCount: webSearchAvailable ? totalWebSearchCalls : null,
          researchDurationMs: Date.now() - started,
        },
        identityAmbiguous,
        searchStagesUsed,
        websitePrefetchGatePass,
        stoppedReason,
        stageTimings,
        sisterHosts,
      };

      logResearchTelemetry({
        event: "company_research_job",
        companyId: input.companyId,
        organizationId: input.organizationId,
        provider: config.provider,
        model,
        durationMs: Date.now() - started,
        webSearchCalls: result.usage?.webSearchCallCount ?? null,
        searchStagesUsed: result.searchStagesUsed ?? null,
        researchStoppedReason: result.stoppedReason ?? null,
        sourceCount: result.sources.length,
        status:
          identityAmbiguous || result.sources.length === 0
            ? "PARTIAL"
            : "COMPLETED",
        retries,
        errorCategory: null,
        websitePrefetchGatePass: websitePrefetchGatePass ?? null,
      });

      return result;
    } catch (error) {
      logResearchTelemetry({
        event: "company_research_job",
        companyId: input.companyId,
        organizationId: input.organizationId,
        provider: config.provider,
        model,
        durationMs: Date.now() - started,
        webSearchCalls: null,
        sourceCount: 0,
        status: "FAILED",
        retries,
        errorCategory: categorizeResearchError(error),
      });
      throw error;
    }
  }
}

/**
 * Default: unconfigured until Research AI env is present.
 * Intentionally does not fabricate company intelligence.
 */
export class UnconfiguredCompanyResearchProvider implements CompanyResearchProvider {
  async research(input: CompanyResearchInput): Promise<CompanyResearchResult> {
    void input;
    throw new AiConfigError(
      "Automated company research is not configured. Use manual research or set RESEARCH_AI_* environment variables.",
    );
  }
}

let overrideProvider: CompanyResearchProvider | null = null;

export function setCompanyResearchProvider(
  provider: CompanyResearchProvider | null,
): void {
  overrideProvider = provider;
}

export function getCompanyResearchProvider(): CompanyResearchProvider {
  if (overrideProvider) return overrideProvider;
  if (isResearchAiConfigured()) {
    return new AiCompanyResearchProvider();
  }
  return new UnconfiguredCompanyResearchProvider();
}
