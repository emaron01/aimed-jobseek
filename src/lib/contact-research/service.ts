import "server-only";

import type {
  ContactResearch,
  UsageEventStatus,
} from "@prisma/client";
import {
  getContactResearchAiProvider,
  getAiConfigPublicSummary,
  getContactResearchAiConfig,
  isContactResearchAiConfigured,
} from "@/lib/ai";
import { paidCallResultJson } from "@/lib/ai/paid-call-gate";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiMessage } from "@/lib/ai/types";
import { CONTACT_RESEARCH_DISABLED_USER_MESSAGE } from "@/lib/contact-research/policy";
import { contactResearchAiResultSchema } from "@/lib/contact-research/contract";
import { CONTACT_RESEARCH_PROMPT_VERSION } from "@/lib/criteria/types";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import { researchExpiresAt } from "@/lib/research/freshness";
import { prisma } from "@/lib/prisma";
import { AiConfigError } from "@/lib/ai/errors";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import { shouldResearchContactRole } from "@/lib/contact-research/trigger";

export { CONTACT_RESEARCH_PROMPT_VERSION, contactResearchAiResultSchema };

export type ContactResearchPolicy = {
  contactResearchEnabled: boolean;
  maxSearchQueriesPerContact: number;
  maxSourcesPerContact: number;
  contactResearchFreshnessDays: number;
};

export class ContactResearchDisabledError extends Error {
  constructor(message = CONTACT_RESEARCH_DISABLED_USER_MESSAGE) {
    super(message);
    this.name = "ContactResearchDisabledError";
  }
}

function buildContactResearchMessages(input: {
  contact: {
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    company: string | null;
    linkedinUrl: string | null;
  };
  personaCriteria: CriterionSnapshot[];
  evidenceGaps: string[];
  webSearchEnabled: boolean;
  maxSources: number;
}): AiMessage[] {
  const system = `You are a production contact role research analyst.
Prompt version: ${CONTACT_RESEARCH_PROMPT_VERSION}

Determine what a contact is responsible for based on public evidence.

CRITICAL RULES:
1. Never fabricate employment history, tenure, or internal org structure.
2. If evidence is insufficient, leave fields null/empty and set confidence LOW.
3. Titles are weak evidence — prioritize responsibilities and ownership areas.
4. Cite only URLs returned by search or provided context.
5. Return JSON matching the schema.
${input.webSearchEnabled ? "6. Web search is enabled — use it when title alone is insufficient." : ""}`;

  const user = JSON.stringify({
    instruction:
      "Research this contact's role responsibilities and ownership areas relevant to the persona criteria.",
    contact: input.contact,
    personaCriteria: input.personaCriteria.map((c) => ({
      name: c.name,
      type: c.criterionType,
      researchGuidance: c.researchGuidance,
    })),
    evidenceGaps: input.evidenceGaps,
    maxSources: input.maxSources,
    responseSchema: {
      roleSummary: "string|null",
      responsibilities: ["string"],
      ownershipAreas: ["string"],
      professionalSignals: ["string"],
      negativeRoleSignals: ["string"],
      confidence: "HIGH|MEDIUM|LOW",
      sources: [
        {
          url: "string",
          title: "string|null",
          publisher: "string|null",
          sourceType: "LINKEDIN|NEWS|OTHER|...",
          retrievedAt: "ISO string",
          supports: ["finding names"],
        },
      ],
    },
  });

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export async function getContactResearch(
  organizationId: string,
  contactId: string,
): Promise<ContactResearch | null> {
  return prisma.contactResearch.findFirst({
    where: { organizationId, contactId },
  });
}

async function upsertNotRequired(
  organizationId: string,
  contactId: string,
  title: string | null,
  reason: string,
): Promise<ContactResearch> {
  return prisma.contactResearch.upsert({
    where: {
      organizationId_contactId: { organizationId, contactId },
    },
    create: {
      organizationId,
      contactId,
      status: "NOT_REQUIRED",
      currentTitle: title,
      roleSummary: reason,
      researchedAt: new Date(),
    },
    update: {
      status: "NOT_REQUIRED",
      currentTitle: title,
      roleSummary: reason,
      researchedAt: new Date(),
    },
  });
}

export type ContactResearchTriggerReason =
  | "fresh-reuse"
  | "researched"
  | "not_required"
  | "unconfigured"
  | "org-disabled";

async function recordContactResearchUsage(input: {
  organizationId: string;
  userId?: string | null;
  contactId: string;
  scoringRunId?: string | null;
  status: UsageEventStatus;
  triggerReason: ContactResearchTriggerReason;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  webSearchCalls?: number | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      contactId: input.contactId,
      scoringRunId: input.scoringRunId,
      category: "CONTACT_RESEARCH",
      operation: "CONTACT_RESEARCH_SYNTHESIS",
      provider: input.provider ?? null,
      model: input.model ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      webSearchCalls: input.webSearchCalls ?? null,
      status: input.status,
      durationMs: input.durationMs ?? null,
      metadata: {
        triggerReason: input.triggerReason,
        ...(input.metadata ?? {}),
      },
    });
  } catch (error) {
    console.error("Failed to record contact research usage event.", error);
  }
}

export async function researchContactRole(input: {
  organizationId: string;
  contactId: string;
  personaCriteria: CriterionSnapshot[];
  policy: ContactResearchPolicy;
  userId?: string | null;
  scoringRunId?: string | null;
}): Promise<ContactResearch> {
  const contact = await prisma.contact.findFirst({
    where: { id: input.contactId, organizationId: input.organizationId },
  });
  if (!contact) {
    throw new TenantError("Contact not found in the active organization.");
  }

  const existing = await getContactResearch(
    input.organizationId,
    input.contactId,
  );

  const usageBase = {
    organizationId: input.organizationId,
    userId: input.userId,
    contactId: input.contactId,
    scoringRunId: input.scoringRunId,
  };

  if (!input.policy.contactResearchEnabled) {
    await recordContactResearchUsage({
      ...usageBase,
      status: "SKIPPED",
      triggerReason: "org-disabled",
      durationMs: 0,
      metadata: { reason: "Contact research is disabled for this organization." },
    });
    if (existing) return existing;
    throw new ContactResearchDisabledError();
  }

  const trigger = shouldResearchContactRole({
    title: contact.title,
    personaCriteria: input.personaCriteria,
    existingResearch: existing,
    freshnessDays: input.policy.contactResearchFreshnessDays,
  });

  if (!trigger.needed) {
    if (trigger.reuseExisting && existing) {
      await recordContactResearchUsage({
        ...usageBase,
        status: "SKIPPED",
        triggerReason: "fresh-reuse",
        durationMs: 0,
        metadata: { reason: trigger.reason },
      });
      return existing;
    }
    const saved = await upsertNotRequired(
      input.organizationId,
      input.contactId,
      contact.title,
      trigger.reason,
    );
    await recordContactResearchUsage({
      ...usageBase,
      status: "SKIPPED",
      triggerReason: "not_required",
      durationMs: 0,
      metadata: { reason: trigger.reason },
    });
    return saved;
  }

  if (!isContactResearchAiConfigured()) {
    await recordContactResearchUsage({
      ...usageBase,
      status: "SKIPPED",
      triggerReason: "unconfigured",
      durationMs: 0,
      metadata: { reason: trigger.reason },
    });
    throw new AiConfigError(
      "Contact role research is not configured. Set CONTACT_RESEARCH_AI_PROVIDER, CONTACT_RESEARCH_AI_MODEL, CONTACT_RESEARCH_AI_MODEL_URL, and CONTACT_RESEARCH_AI_API_KEY.",
    );
  }

  const started = Date.now();
  const config = getContactResearchAiConfig();
  const providerSummary = getAiConfigPublicSummary(config);
  const webSearchEnabled = config.provider === "openai-responses";

  const { identifyPersonaEvidenceGaps } =
    await import("@/lib/contact-research/gaps");
  const evidenceGaps = identifyPersonaEvidenceGaps(
    input.personaCriteria,
    existing,
    contact.title,
  );

  try {
    const ai = getContactResearchAiProvider();
    const response = await ai.generateStructured({
      ...structuredOutputRequest("contactResearch"),
      messages: buildContactResearchMessages({
        contact: {
          firstName: contact.firstName,
          lastName: contact.lastName,
          title: contact.title,
          company: contact.company,
          linkedinUrl: contact.linkedinUrl,
        },
        personaCriteria: input.personaCriteria,
        evidenceGaps,
        webSearchEnabled,
        maxSources: input.policy.maxSourcesPerContact,
      }),
    });

    const result = response.data;
    const sources = result.sources.slice(0, input.policy.maxSourcesPerContact);
    const hasRoleEvidence =
      Boolean(result.roleSummary?.trim()) ||
      result.responsibilities.length > 0 ||
      result.ownershipAreas.length > 0;

    const status =
      hasRoleEvidence && result.confidence !== "LOW" ? "COMPLETED" : "PARTIAL";
    const now = new Date();
    const expiresAt = researchExpiresAt(
      now,
      input.policy.contactResearchFreshnessDays,
    );
    const durationMs = Date.now() - started;

    const saved = await prisma.contactResearch.upsert({
      where: {
        organizationId_contactId: {
          organizationId: input.organizationId,
          contactId: input.contactId,
        },
      },
      create: {
        organizationId: input.organizationId,
        contactId: input.contactId,
        status,
        researchMethod: "AUTOMATED",
        confidence: hasRoleEvidence ? result.confidence : "LOW",
        currentTitle: contact.title,
        roleSummary: result.roleSummary,
        responsibilities: paidCallResultJson(result.responsibilities),
        ownershipAreas: paidCallResultJson(result.ownershipAreas),
        professionalSignals: paidCallResultJson(result.professionalSignals),
        negativeRoleSignals: paidCallResultJson(result.negativeRoleSignals),
        researchSources: paidCallResultJson(sources),
        researchedAt: now,
        expiresAt,
        aiProvider: providerSummary.provider,
        aiModel: providerSummary.model,
        aiModelUrlIdentifier: providerSummary.modelUrlIdentifier,
        promptVersion: CONTACT_RESEARCH_PROMPT_VERSION,
        inputTokens: response.usage?.inputTokens ?? null,
        outputTokens: response.usage?.outputTokens ?? null,
        webSearchCallCount: response.usage?.webSearchCalls ?? null,
        researchDurationMs: durationMs,
      },
      update: {
        status,
        researchMethod: "AUTOMATED",
        confidence: hasRoleEvidence ? result.confidence : "LOW",
        currentTitle: contact.title,
        roleSummary: result.roleSummary,
        responsibilities: paidCallResultJson(result.responsibilities),
        ownershipAreas: paidCallResultJson(result.ownershipAreas),
        professionalSignals: paidCallResultJson(result.professionalSignals),
        negativeRoleSignals: paidCallResultJson(result.negativeRoleSignals),
        researchSources: paidCallResultJson(sources),
        researchedAt: now,
        expiresAt,
        aiProvider: providerSummary.provider,
        aiModel: providerSummary.model,
        aiModelUrlIdentifier: providerSummary.modelUrlIdentifier,
        promptVersion: CONTACT_RESEARCH_PROMPT_VERSION,
        inputTokens: response.usage?.inputTokens ?? null,
        outputTokens: response.usage?.outputTokens ?? null,
        webSearchCallCount: response.usage?.webSearchCalls ?? null,
        researchDurationMs: durationMs,
      },
    });

    await recordContactResearchUsage({
      ...usageBase,
      status: status === "COMPLETED" ? "SUCCESS" : "PARTIAL",
      triggerReason: "researched",
      provider: providerSummary.provider,
      model: providerSummary.model,
      inputTokens: response.usage?.inputTokens ?? null,
      outputTokens: response.usage?.outputTokens ?? null,
      webSearchCalls: response.usage?.webSearchCalls ?? null,
      durationMs,
      metadata: {
        confidence: saved.confidence,
        sourceCount: sources.length,
        promptVersion: CONTACT_RESEARCH_PROMPT_VERSION,
        reason: trigger.reason,
      },
    });

    return saved;
  } catch (error) {
    await recordContactResearchUsage({
      ...usageBase,
      status: "FAILED",
      triggerReason: "researched",
      provider: providerSummary.provider,
      model: providerSummary.model,
      durationMs: Date.now() - started,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
        reason: trigger.reason,
      },
    });
    throw error;
  }
}
