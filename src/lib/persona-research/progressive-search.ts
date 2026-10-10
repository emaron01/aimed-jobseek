/**
 * Progressive Persona web search — RESEARCH_AI acquisition only.
 */

import "server-only";

import { paidCallResultJson } from "@/lib/ai/paid-call-gate";
import { prisma } from "@/lib/prisma";
import { discoverSourcesViaWebSearch } from "@/lib/research/web-search-retriever";
import { fetchProductPageUrl } from "@/lib/product-research/fetch-url";
import {
  normalizeProductSourceUrl,
  sha256Hex,
} from "@/lib/product-research/url";
import { recordUsageEvent } from "@/lib/usage/events";
import {
  buildPersonaSearchFocus,
  evaluatePersonaEvidenceSufficiency,
} from "@/lib/persona-research/sufficiency";

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export type PersonaResearchExcerpt = {
  sourceId: string;
  provenanceClass: "CUSTOMER_EVIDENCE" | "WEB_EVIDENCE";
  displayName: string;
  text: string;
  url?: string | null;
};

export async function runProgressivePersonaWebSearch(input: {
  organizationId: string;
  productId: string;
  userId: string | null;
  correlationId: string;
  personaSetupRunId: string;
  roleName: string;
  productName: string;
  industryHint: string | null;
  productEvidenceText: string;
  personaMaterialText: string;
  maxSearchQueries: number;
  maxSources: number;
  freshnessDays: number;
}): Promise<{
  excerpts: PersonaResearchExcerpt[];
  sourceIds: string[];
  webSearchQueriesUsed: number;
  stoppedReason: "sufficient" | "max_queries" | "no_web_search" | "source_cap";
  errors: string[];
}> {
  const errors: string[] = [];
  const excerpts: PersonaResearchExcerpt[] = [];
  const sourceIds: string[] = [];
  let webSearchQueriesUsed = 0;
  let webText = "";

  let sufficiency = evaluatePersonaEvidenceSufficiency({
    roleName: input.roleName,
    productName: input.productName,
    productEvidenceText: input.productEvidenceText,
    personaMaterialText: input.personaMaterialText,
    webEvidenceText: webText,
  });

  if (sufficiency.sufficient || input.maxSearchQueries <= 0) {
    return {
      excerpts,
      sourceIds,
      webSearchQueriesUsed: 0,
      stoppedReason: sufficiency.sufficient ? "sufficient" : "no_web_search",
      errors,
    };
  }

  let stages = 0;
  let stoppedReason: "sufficient" | "max_queries" | "no_web_search" | "source_cap" =
    "max_queries";

  while (
    !sufficiency.sufficient &&
    webSearchQueriesUsed < input.maxSearchQueries &&
    stages < input.maxSearchQueries &&
    sourceIds.length < input.maxSources
  ) {
    const focus = buildPersonaSearchFocus({
      roleName: input.roleName,
      productName: input.productName,
      industryHint: input.industryHint,
      missing: sufficiency.missingDimensions,
    });

    let discovery;
    try {
      discovery = await discoverSourcesViaWebSearch({
        productName: `${input.roleName} ${input.productName}`,
        primaryUrl: null,
        domain: null,
        searchFocus: focus,
        searchesRemaining: Math.max(
          0,
          input.maxSearchQueries - webSearchQueriesUsed,
        ),
      });
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `Persona web search failed: ${error.message.slice(0, 160)}`
          : "Persona web search failed.",
      );
      stoppedReason = "no_web_search";
      break;
    }

    const calls = discovery.webSearchCalls > 0 ? discovery.webSearchCalls : 1;
    webSearchQueriesUsed += calls;
    stages += 1;

    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "PERSONA_RESEARCH",
      operation: "PERSONA_WEB_SEARCH",
      provider: discovery.provider,
      model: discovery.model,
      status: discovery.sources.length > 0 ? "SUCCESS" : "PARTIAL",
      webSearchCalls: discovery.webSearchCalls || null,
      operationId: input.correlationId,
      metadata: {
        correlationId: input.correlationId,
        productId: input.productId,
        personaSetupRunId: input.personaSetupRunId,
        searchFocus: focus.slice(0, 300),
      },
    });

    if (discovery.skippedReason) {
      stoppedReason = "no_web_search";
      break;
    }

    let added = 0;
    for (const src of discovery.sources) {
      if (sourceIds.length >= input.maxSources) {
        stoppedReason = "source_cap";
        break;
      }
      const normalized = normalizeProductSourceUrl(src.url);
      if (!normalized) continue;

      const existing = await prisma.personaSource.findFirst({
        where: {
          organizationId: input.organizationId,
          productId: input.productId,
          normalizedUrlKey: normalized,
          status: { in: ["ACQUIRED", "EXTRACTED"] },
        },
        orderBy: { retrievedAt: "desc" },
      });
      if (
        existing?.freshnessExpiresAt &&
        existing.freshnessExpiresAt.getTime() > Date.now() &&
        existing.extractedText
      ) {
        if (!sourceIds.includes(existing.id)) {
          sourceIds.push(existing.id);
          excerpts.push({
            sourceId: existing.id,
            provenanceClass: "WEB_EVIDENCE",
            displayName: existing.displayName,
            text: existing.extractedText,
            url: existing.originalUrl,
          });
          webText += `\n${existing.extractedText}`;
        }
        continue;
      }

      const fetched = await fetchProductPageUrl(normalized);
      if (!fetched.ok || !fetched.text) {
        if (fetched.errorSafe) errors.push(fetched.errorSafe);
        continue;
      }
      const hash = await sha256Hex(
        `persona-url:${normalized}:${fetched.text.slice(0, 2000)}`,
      );
      const dup = await prisma.personaSource.findFirst({
        where: { organizationId: input.organizationId, contentHash: hash },
      });
      if (dup) {
        if (!sourceIds.includes(dup.id) && dup.extractedText) {
          sourceIds.push(dup.id);
          excerpts.push({
            sourceId: dup.id,
            provenanceClass: "WEB_EVIDENCE",
            displayName: dup.displayName,
            text: dup.extractedText,
            url: dup.originalUrl,
          });
          webText += `\n${dup.extractedText}`;
        }
        continue;
      }

      const row = await prisma.personaSource.create({
        data: {
          organizationId: input.organizationId,
          productId: input.productId,
          personaSetupRunId: input.personaSetupRunId,
          sourceType: "URL",
          displayName: src.title || fetched.title || normalized,
          originalUrl: fetched.url,
          normalizedUrlKey: normalized,
          acquisitionMethod: "WEB_SEARCH",
          provenanceClass: "WEB_EVIDENCE",
          createdByUserId: input.userId,
          retrievedAt: new Date(),
          contentHash: hash,
          status: "ACQUIRED",
          extractedText: fetched.text,
          freshnessExpiresAt: daysFromNow(input.freshnessDays),
          metadataJson: paidCallResultJson({
            searchQuery: focus.slice(0, 500),
            correlationId: input.correlationId,
            provider: discovery.provider,
            model: discovery.model,
          }),
        },
      });

      await recordUsageEvent({
        organizationId: input.organizationId,
        userId: input.userId,
        category: "PERSONA_RESEARCH",
        operation: "PERSONA_URL_RETRIEVAL",
        provider: discovery.provider,
        model: discovery.model,
        status: "SUCCESS",
        operationId: input.correlationId,
        metadata: {
          correlationId: input.correlationId,
          personaSetupRunId: input.personaSetupRunId,
          sourceId: row.id,
        },
      });

      sourceIds.push(row.id);
      excerpts.push({
        sourceId: row.id,
        provenanceClass: "WEB_EVIDENCE",
        displayName: row.displayName,
        text: fetched.text,
        url: row.originalUrl,
      });
      webText += `\n${fetched.text}`;
      added += 1;
    }

    sufficiency = evaluatePersonaEvidenceSufficiency({
      roleName: input.roleName,
      productName: input.productName,
      productEvidenceText: input.productEvidenceText,
      personaMaterialText: input.personaMaterialText,
      webEvidenceText: webText,
    });
    if (sufficiency.sufficient) {
      stoppedReason = "sufficient";
      break;
    }
    if (added === 0 && discovery.sources.length === 0) break;
  }

  return {
    excerpts,
    sourceIds,
    webSearchQueriesUsed,
    stoppedReason,
    errors,
  };
}
