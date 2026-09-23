import "server-only";

import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiProvider, AiStructuredResponse } from "@/lib/ai/types";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import {
  buildRepClaimSources,
  deterministicClaimViolations,
  deterministicSignalLeakageViolations,
  keepModelOriginatedViolations,
  normalizedClaimText,
  type ConsultationClaimSource,
} from "@/lib/email-generation/claim-origin";
import { prisma } from "@/lib/prisma";
import {
  claimValidationSchema,
  type ClaimValidationResult,
  type ClaimValidationViolation,
} from "@/lib/email-generation/claim-validation-contract";
import {
  contactResearchForPrompt,
  resolvePersonalization,
} from "@/lib/email-generation/personalization";

export { claimValidationSchema, deterministicClaimViolations };
export type { ClaimValidationViolation };

/** Product + prospect research texts that can support a claim (silent when matched). */
export function claimEvidenceTexts(context: EmailGenerationContext): string[] {
  const personalization = resolvePersonalization({
    companyResearch: context.companyResearch,
    contactResearch: contactResearchForPrompt(context.contactResearch),
  });
  const company = personalization.companyResearch;
  const contact = personalization.contactResearch;
  return [
    ...context.product.evidence,
    ...context.product.messaging.supportedClaims,
    context.product.description,
    context.product.valueProposition,
    // Recipient identity is known contact-record data, not invention.
    context.contact.firstName,
    context.contact.lastName,
    context.contact.title,
    context.contact.company,
    context.contact.industry,
    context.contact.location,
    company?.companySummary,
    company?.whatTheySell,
    company?.businessModel,
    company?.companySizeContext,
    ...(company?.customerTypes ?? []),
    ...(company?.primaryMarkets ?? []),
    contact?.roleSummary,
    ...(contact?.responsibilities ?? []),
    ...(contact?.ownershipAreas ?? []),
  ].filter((value): value is string => Boolean(value?.trim()));
}

export function prospectResearchPayload(context: EmailGenerationContext): {
  tier: string;
  companyResearchUsable: boolean;
  contactResearchUsable: boolean;
  companyResearch: ReturnType<typeof resolvePersonalization>["companyResearch"];
  contactResearch: ReturnType<typeof resolvePersonalization>["contactResearch"];
  recipientIdentity: {
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    company: string | null;
    industry: string | null;
    location: string | null;
  };
} {
  const personalization = resolvePersonalization({
    companyResearch: context.companyResearch,
    contactResearch: contactResearchForPrompt(context.contactResearch),
  });
  return {
    tier: personalization.tier,
    companyResearchUsable: personalization.companyResearchUsable,
    contactResearchUsable: personalization.contactResearchUsable,
    companyResearch: personalization.companyResearch,
    contactResearch: personalization.contactResearch,
    recipientIdentity: {
      firstName: context.contact.firstName,
      lastName: context.contact.lastName,
      title: context.contact.title,
      company: context.contact.company,
      industry: context.contact.industry,
      location: context.contact.location,
    },
  };
}

export async function validateGeneratedEmailClaims(input: {
  ai: AiProvider;
  context: EmailGenerationContext;
  subject: string;
  body: string;
  regenerationGuidance?: string | null;
  /** Text the rep introduced relative to generatedBody (manual edit path). */
  repEditText?: string | null;
}): Promise<{
  response: AiStructuredResponse<ClaimValidationResult>;
  violations: ClaimValidationViolation[];
}> {
  const repSources = buildRepClaimSources({
    offer: input.context.campaign,
    emailGuidance: input.context.campaign.emailGuidance,
    regenerationGuidance: input.regenerationGuidance,
    repEditText: input.repEditText,
  });
  const evidenceTexts = claimEvidenceTexts(input.context);
  const consultationSources = await consultationClaimSources({
    organizationId: input.context.organizationId,
    campaignId: input.context.campaign.id,
  });
  const prospect = prospectResearchPayload(input.context);

  const deterministic = [
    ...deterministicClaimViolations({
      body: input.body,
      claimsNotToMake: input.context.product.messaging.claimsNotToMake,
      terminologyToAvoid: input.context.product.messaging.terminologyToAvoid,
      repSources,
    }),
    ...deterministicSignalLeakageViolations({
      body: input.body,
      riskSignals: input.context.excludedCopySignals.riskSignals,
      professionalSignals: input.context.excludedCopySignals.professionalSignals,
      negativeRoleSignals: input.context.excludedCopySignals.negativeRoleSignals,
      repSources,
    }),
  ];
  const response = await input.ai.generateStructured({
    ...structuredOutputRequest("emailClaimValidation"),
    messages: [
      {
        role: "system",
        content:
          "You check whether the MODEL invented unsupported assertions. The rep is trusted: anything supported by the campaign offer, email guidance, regeneration guidance, or rep edit text must NOT be flagged. Anything supported by product evidence, supportedClaims, or usable company/contact research must NOT be flagged. Recipient identity fields (name, title, company name) are allowed. Only flag MODEL_ORIGINATED inventions. At personalization tier THIN with no usable research, any specific claim about the prospect's business, role situation, or company internals beyond recipient identity is unsupported by definition — flag it with the offending sentence. Return JSON only.",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            generatedEmail: {
              subject: input.subject,
              body: input.body,
            },
            repSources: {
              campaignOffer: repSources.offerText || null,
              emailGuidance: repSources.emailGuidance,
              regenerationGuidance: repSources.regenerationGuidance,
              repEditText: repSources.repEditText ?? null,
            },
            personalization: {
              tier: prospect.tier,
              companyResearchUsable: prospect.companyResearchUsable,
              contactResearchUsable: prospect.contactResearchUsable,
            },
            recipientIdentity: prospect.recipientIdentity,
            companyResearch: prospect.companyResearch,
            contactResearch: prospect.contactResearch,
            claimsNotToMake: input.context.product.messaging.claimsNotToMake,
            terminologyToAvoid:
              input.context.product.messaging.terminologyToAvoid,
            supportedClaims: input.context.product.messaging.supportedClaims,
            productEvidence: input.context.product.evidence,
            personaMessagingNotes: input.context.persona.messagingNotes,
            instruction:
              "Flag only model inventions about the product, offer, or prospect. Never flag repSources (including emailGuidance such as website-visitor knowledge). Never flag facts supported by companyResearch or contactResearch. At THIN with null research, flag specific prospect/company claims beyond recipientIdentity.",
          },
          null,
          2,
        ),
      },
    ],
  });
  const merged = [...deterministic, ...response.data.violations].filter(
    (violation, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.type === violation.type &&
          normalizedClaimText(candidate.description) ===
            normalizedClaimText(violation.description),
      ) === index,
  );
  if (!response.data.compliant && merged.length === 0) {
    merged.push({
      type: "UNSUPPORTED_FACT",
      description:
        "Semantic validation marked the draft non-compliant without a specific excerpt.",
      matchedGuard: null,
      bodyExcerpt: null,
    });
  }
  const violations = keepModelOriginatedViolations(
    merged,
    repSources,
    evidenceTexts,
    consultationSources,
  );
  return { response, violations };
}

async function consultationClaimSources(input: {
  organizationId: string;
  campaignId: string;
}): Promise<ConsultationClaimSource[]> {
  const turns = await prisma.consultationTurn.findMany({
    where: {
      organizationId: input.organizationId,
      speaker: "SEEKER",
      skipped: false,
      seekerAuthored: true,
      session: { campaignId: input.campaignId },
    },
    select: { id: true, body: true },
  });
  return turns
    .filter((turn) => turn.body.trim())
    .map((turn) => ({
      id: turn.id,
      text: turn.body,
      seekerAuthored: true as const,
    }));
}
