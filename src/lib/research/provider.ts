import {
  getResearchAiConfig,
  getResearchAiProvider,
  isResearchAiConfigured,
} from "@/lib/ai";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import {
  AiConfigError,
  AiProviderError,
  AiTimeoutError,
  AiValidationError,
} from "@/lib/ai/errors";
import { RESEARCH_PROMPT_VERSION } from "@/lib/research/config";
import {
  evidenceFromNormalizedSources,
  mergeEvidenceBundles,
} from "@/lib/research/evidence";
import { finalizeResearchSources } from "@/lib/research/finalize-sources";
import { buildCompanyResearchMessages } from "@/lib/research/prompt";
import { appendSeekerSuppliedResearchEvidence } from "@/lib/research/seeker-supplied-notes";
import {
  getCompanySourceRetriever,
  hasFirstPartyWebsiteEvidence,
} from "@/lib/research/sources";
import {
  buildTargetedSearchFocus,
  evaluateEvidenceSufficiency,
} from "@/lib/research/sufficiency";
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
  webSearchCallCount: number | null;
  researchDurationMs: number | null;
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
 * Known data → website prefetch synthesis (when fetch succeeds) → always web_search
 * (bounded by Organization ResearchPolicy.maxSearchQueriesPerCompany).
 *
 * When first-party fetch returns nothing (403, empty), skip prefetch synthesis
 * and start with web_search immediately.
 */
export class AiCompanyResearchProvider implements CompanyResearchProvider {
  async research(
    input: CompanyResearchInput,
  ): Promise<AutomatedCompanyResearchResult> {
    const started = Date.now();
    const config = getResearchAiConfig();
    let retries = 0;
    let totalInputTokens: number | null = null;
    let totalOutputTokens: number | null = null;
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
      const ai = getResearchAiProvider();
      const retriever = getCompanySourceRetriever();
      const websiteEvidence = await retriever.retrieve(input);
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

      const maxQueries = Math.max(1, depth.maxSearchQueriesPerCompany);

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
        searchBudget: number,
        firstStage: "initial" | "follow_up",
      ): Promise<void> => {
        current = await runStage({
          stage: firstStage,
          searchFocus: initialFocus,
          searchesRemaining: searchBudget,
          webSearchEnabled: true,
        });

        let sufficiency = evaluateEvidenceSufficiency({
          sources: current.sources,
          fields: current,
          maxSourcesPerCompany: depth.maxSourcesPerCompany,
        });

        while (
          !sufficiency.sufficient &&
          totalWebSearchCalls < maxQueries &&
          searchStagesUsed < maxQueries + 1
        ) {
          if (
            sufficiency.missingPrimary.length === 0 &&
            sufficiency.missingSecondary.every((k) => k === "estimatedAov")
          ) {
            break;
          }

          const focus = buildTargetedSearchFocus(
            sufficiency.missingPrimary,
            sufficiency.missingSecondary,
          );
          current = await runStage({
            stage: "follow_up",
            searchFocus: focus,
            searchesRemaining: Math.max(0, maxQueries - totalWebSearchCalls),
            webSearchEnabled: true,
          });
          sufficiency = evaluateEvidenceSufficiency({
            sources: current.sources,
            fields: current,
            maxSourcesPerCompany: depth.maxSourcesPerCompany,
          });
        }

        stoppedReason = sufficiency.sufficient ? "sufficient" : "max_queries";
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
          WEBSITE_FETCH_UNAVAILABLE_FOCUS,
          maxQueries,
          "initial",
        );
      } else {
        current = await runStage({
          stage: "initial",
          searchesRemaining: maxQueries,
          webSearchEnabled: false,
        });

        const websiteGate = evaluateWebsiteFirstSufficiency({
          websiteExcerptText,
          sources: current.sources,
          fields: current,
        });
        websitePrefetchGatePass = websiteGate.sufficient;

        const searchFocus = websiteGate.sufficient
          ? "First-party website evidence is available; use web search to corroborate findings and fill gaps (especially employee count, revenue, and third-party directory sources)."
          : websiteGate.failReasons.join("; ") ||
            "Website evidence insufficient; find official and reputable third-party sources for primary company dimensions.";

        await runWebSearchStages(
          searchFocus,
          Math.max(0, maxQueries - 1),
          "follow_up",
        );
      }

      // Prefer the latest stage result (`current`); `lastValidated` is only a
      // defensive mirror because TS does not track assignments inside runStage.
      const validatedResult = current ?? lastValidated;
      if (!validatedResult) {
        throw new AiValidationError("Research produced no validated result.");
      }

      const finalizedSources = finalizeResearchSources({
        sources: validatedResult.sources,
        companyWebsiteUrl: input.website,
        companyDomain: input.normalizedDomain,
        maxSources: depth.maxSourcesPerCompany,
      });

      const finalized: CompanyResearchResult = {
        ...validatedResult,
        sources: finalizedSources,
      };

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
          aiModel: config.model,
          aiModelUrlIdentifier: config.modelUrlIdentifier,
          promptVersion: RESEARCH_PROMPT_VERSION,
        },
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          webSearchCallCount: webSearchAvailable ? totalWebSearchCalls : null,
          researchDurationMs: Date.now() - started,
        },
        identityAmbiguous,
        searchStagesUsed,
        websitePrefetchGatePass,
        stoppedReason,
        stageTimings,
      };

      logResearchTelemetry({
        event: "company_research_job",
        companyId: input.companyId,
        organizationId: input.organizationId,
        provider: config.provider,
        model: config.model,
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
        model: config.model,
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
