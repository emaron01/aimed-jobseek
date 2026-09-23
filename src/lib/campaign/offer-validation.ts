import "server-only";

import { createHash } from "node:crypto";
import { getEmailAiConfig, getEmailAiProvider } from "@/lib/ai";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiProvider, AiStructuredResponse } from "@/lib/ai/types";
import {
  offerValidationSchema,
  type OfferValidationAiResult,
} from "@/lib/campaign/offer-validation-contract";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import { omitCompensationFromUnknown } from "@/lib/product-research/candidate-profile";

export { offerValidationSchema };

export type CampaignOfferFields = {
  offerName: string | null;
  offerDescription: string | null;
  offerCta: string | null;
  offerNotes: string | null;
};

export type OfferConflict = {
  code:
    | "CLAIM_CONFLICT"
    | "TERM_CONFLICT"
    | "EVIDENCE_CONFLICT"
    | "VALIDATION_UNAVAILABLE";
  message: string;
  offerExcerpt: string | null;
  evidenceExcerpt: string | null;
};

export type OfferValidationResult = {
  hash: string;
  conflicts: OfferConflict[];
  semanticValidationCompleted: boolean;
};

export function offerConflictsFromJson(value: unknown): OfferConflict[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const conflicts = (value as { conflicts?: unknown }).conflicts;
  if (!Array.isArray(conflicts)) return [];
  return conflicts.filter((entry): entry is OfferConflict => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return false;
    const candidate = entry as Partial<OfferConflict>;
    return (
      typeof candidate.code === "string" &&
      typeof candidate.message === "string"
    );
  });
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

export function evidenceFragments(value: unknown, path = "evidence"): string[] {
  if (typeof value === "string") {
    return value.trim() ? [`${path}: ${value.trim()}`] : [];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [`${path}: ${String(value)}`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      evidenceFragments(entry, `${path}[${index}]`),
    );
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, entry]) => evidenceFragments(entry, `${path}.${key}`),
  );
}

export function campaignOfferGuardContext(input: {
  product: {
    description: string | null;
    valueProposition: string | null;
    messagingJson: unknown;
    profileJson?: unknown;
  };
  persona: {
    messagingNotes: string | null;
    personaMessagingJson: unknown;
  } | null;
  normalizedEvidenceJson?: unknown;
}): {
  claimsNotToMake: string[];
  terminologyToAvoid: string[];
  evidence: string[];
} {
  const productMessaging = objectValue(input.product.messagingJson);
  const personaMessaging = objectValue(
    input.persona?.personaMessagingJson ?? null,
  );
  return {
    claimsNotToMake: stringList(productMessaging.claimsNotToMake),
    terminologyToAvoid: stringList(productMessaging.terminologyToAvoid),
    evidence: [
      input.product.description,
      input.product.valueProposition,
      ...stringList(productMessaging.proofPoints),
      ...stringList(productMessaging.supportedClaims),
      ...stringList(personaMessaging.proofPoints),
      input.persona?.messagingNotes,
      ...evidenceFragments(
        omitCompensationFromUnknown(input.product.profileJson),
        "productProfile",
      ),
      ...evidenceFragments(
        input.normalizedEvidenceJson,
        "approvedProductEvidence",
      ),
    ].filter((value): value is string => Boolean(value?.trim())),
  };
}

export function campaignOfferText(offer: CampaignOfferFields): string {
  return [
    offer.offerName,
    offer.offerDescription,
    offer.offerCta,
    offer.offerNotes,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n")
    .trim();
}

export function campaignOfferValidationHash(input: {
  offer: CampaignOfferFields;
  claimsNotToMake: string[];
  terminologyToAvoid: string[];
  evidence: string[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        offer: input.offer,
        claimsNotToMake: input.claimsNotToMake,
        terminologyToAvoid: input.terminologyToAvoid,
        evidence: input.evidence,
      }),
    )
    .digest("hex");
}

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9$%]+/g, " ")
    .trim();
}

function conflictKey(conflict: OfferConflict): string {
  return `${conflict.code}:${normalized(conflict.message)}`;
}

export function detectDeterministicOfferConflicts(input: {
  offerText: string;
  claimsNotToMake: string[];
  terminologyToAvoid: string[];
}): OfferConflict[] {
  const conflicts: OfferConflict[] = [];
  const offerNormalized = normalized(input.offerText);

  for (const term of input.terminologyToAvoid) {
    if (term && offerNormalized.includes(normalized(term))) {
      conflicts.push({
        code: "TERM_CONFLICT",
        message: `Your offer uses “${term},” which your product materials say to avoid. Keep anyway?`,
        offerExcerpt: term,
        evidenceExcerpt: term,
      });
    }
  }

  for (const claim of input.claimsNotToMake) {
    if (claim && offerNormalized.includes(normalized(claim))) {
      conflicts.push({
        code: "CLAIM_CONFLICT",
        message: `Your offer includes “${claim},” which your product materials prohibit. Keep anyway?`,
        offerExcerpt: claim,
        evidenceExcerpt: claim,
      });
    }
  }

  return Array.from(
    new Map(
      conflicts.map((conflict) => [conflictKey(conflict), conflict]),
    ).values(),
  );
}

export async function validateOfferSemantically(input: {
  ai: AiProvider;
  offerText: string;
  claimsNotToMake: string[];
  terminologyToAvoid: string[];
  productEvidence: string[];
}): Promise<AiStructuredResponse<OfferValidationAiResult>> {
  return input.ai.generateStructured({
    ...structuredOutputRequest("campaignOfferValidation"),
    messages: [
      {
        role: "system",
        content:
          "Validate an offer against the supplied product restrictions and evidence. Evaluate every factual assertion and commitment by meaning, without relying on exact wording or preselected categories. Report a conflict when an offer assertion is prohibited, uses avoided terminology, or contradicts a stated product fact. Do not infer a conflict merely because the evidence is silent. A newer offer may legitimately differ, so report specific warnings rather than rewriting or rejecting it. Return JSON only.",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            offer: input.offerText,
            claimsNotToMake: input.claimsNotToMake,
            terminologyToAvoid: input.terminologyToAvoid,
            productEvidence: input.productEvidence,
          },
          null,
          2,
        ),
      },
    ],
  });
}

export async function validateCampaignOffer(input: {
  organizationId: string;
  userId: string;
  productId: string;
  personaId?: string | null;
  offer: CampaignOfferFields;
}): Promise<OfferValidationResult> {
  const [product, persona] = await Promise.all([
    prisma.product.findFirst({
      where: { id: input.productId, organizationId: input.organizationId },
      select: {
        description: true,
        valueProposition: true,
        messagingJson: true,
        profileJson: true,
        approvedEvidenceBundleId: true,
      },
    }),
    input.personaId
      ? prisma.persona.findFirst({
          where: {
            id: input.personaId,
            organizationId: input.organizationId,
          },
          select: {
            messagingNotes: true,
            personaMessagingJson: true,
          },
        })
      : Promise.resolve(null),
  ]);
  if (!product) {
    throw new TenantError(
      "Product must belong to the active organization.",
    );
  }
  if (input.personaId && !persona) {
    throw new TenantError(
      "Persona must belong to the active organization.",
    );
  }

  const approvedEvidence = product.approvedEvidenceBundleId
    ? await prisma.productEvidenceBundle.findFirst({
        where: {
          id: product.approvedEvidenceBundleId,
          organizationId: input.organizationId,
          productId: input.productId,
        },
        select: { normalizedEvidenceJson: true },
      })
    : null;
  const { claimsNotToMake, terminologyToAvoid, evidence } =
    campaignOfferGuardContext({
      product,
      persona,
      normalizedEvidenceJson: approvedEvidence?.normalizedEvidenceJson,
    });
  const offerText = campaignOfferText(input.offer);
  const hash = campaignOfferValidationHash({
    offer: input.offer,
    claimsNotToMake,
    terminologyToAvoid,
    evidence,
  });
  if (!offerText) {
    return { hash, conflicts: [], semanticValidationCompleted: true };
  }

  const deterministic = detectDeterministicOfferConflicts({
    offerText,
    claimsNotToMake,
    terminologyToAvoid,
  });
  const started = Date.now();

  try {
    getEmailAiConfig();
    const ai = getEmailAiProvider();
    const response = await validateOfferSemantically({
      ai,
      offerText,
      claimsNotToMake,
      terminologyToAvoid,
      productEvidence: evidence,
    });
    const conflicts = Array.from(
      new Map(
        [...deterministic, ...response.data.conflicts].map((conflict) => [
          conflictKey(conflict),
          conflict,
        ]),
      ).values(),
    );

    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "EMAIL_GENERATION",
      operation: "CAMPAIGN_OFFER_VALIDATED",
      provider: response.provider,
      model: response.model,
      inputTokens: response.usage?.inputTokens ?? null,
      outputTokens: response.usage?.outputTokens ?? null,
      status: "SUCCESS",
      durationMs: Date.now() - started,
      metadata: { conflictCount: conflicts.length },
    });
    return { hash, conflicts, semanticValidationCompleted: true };
  } catch (error) {
    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "EMAIL_GENERATION",
      operation: "CAMPAIGN_OFFER_VALIDATED",
      status: "FAILED",
      durationMs: Date.now() - started,
      metadata: {
        deterministicConflictCount: deterministic.length,
        errorType:
          error instanceof Error ? error.constructor.name : "UnknownError",
      },
    });
    return {
      hash,
      conflicts: [
        ...deterministic,
        {
          code: "VALIDATION_UNAVAILABLE",
          message:
            "Semantic offer validation was unavailable, so paraphrased claim conflicts may not have been detected. Keep anyway?",
          offerExcerpt: null,
          evidenceExcerpt: null,
        },
      ],
      semanticValidationCompleted: false,
    };
  }
}
