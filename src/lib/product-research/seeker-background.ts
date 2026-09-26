import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  applicationAssetConfig,
  candidateProfileEditCopy,
  consultationConversationCopy,
} from "@/lib/product-config";
import {
  parseCandidateProfileSafe,
  emptyCandidateProfile,
  type CandidateProfile,
  type ProfileFactItem,
} from "@/lib/product-research/candidate-profile";
import { TenantError } from "@/lib/tenant/errors";
import { vocab } from "@/lib/product-config";

export const SEEKER_BACKGROUND_MAX_CHARS =
  consultationConversationCopy.knowAboutMeMaxChars;
export const SEEKER_STATED_FACT_ID = "seeker-stated-background";

export function normalizeSeekerBackgroundNote(
  value: string | null | undefined,
): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

export function seekerBackgroundText(profile: CandidateProfile): string {
  return profile.seekerStatedFacts
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function saveSeekerStatedBackground(input: {
  organizationId: string;
  productId: string;
  userId: string;
  campaignId: string;
  text: string;
}): Promise<CandidateProfile> {
  const text = normalizeSeekerBackgroundNote(input.text);
  if (!text) {
    throw new TenantError(consultationConversationCopy.knowAboutMeEmpty);
  }
  if (text.length > SEEKER_BACKGROUND_MAX_CHARS) {
    throw new TenantError(consultationConversationCopy.knowAboutMeTooLong);
  }
  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
    select: { id: true, profileJson: true },
  });
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} was not found.`);
  }
  const parsed = product.profileJson
    ? parseCandidateProfileSafe(product.profileJson)
    : { ok: true as const, profile: emptyCandidateProfile() };
  if (!parsed.ok) {
    throw new TenantError(
      `The ${vocab.product.singular} could not be read, so this was not saved.`,
    );
  }
  const contentHash = createHash("sha256").update(text).digest("hex");
  const existing = await prisma.productSource.findUnique({
    where: {
      organizationId_productId_contentHash: {
        organizationId: input.organizationId,
        productId: product.id,
        contentHash,
      },
    },
    select: { id: true },
  });
  const source =
    existing ??
    (await prisma.productSource.create({
      data: {
        organizationId: input.organizationId,
        productId: product.id,
        sourceType: "USER_NOTE",
        displayName: candidateProfileEditCopy.seekerBackgroundSource,
        acquisitionMethod: "USER_CONFIRMED",
        createdByUserId: input.userId,
        contentHash,
        status: "EXTRACTED",
        extractedText: text,
        retrievedAt: new Date(),
      },
      select: { id: true },
    }));
  const fact: ProfileFactItem = {
    id: SEEKER_STATED_FACT_ID,
    kind: "FACT",
    text,
    provenance: [{ sourceId: source.id }],
  };
  const next: CandidateProfile = {
    ...parsed.profile,
    seekerStatedFacts: [fact],
  };
  await prisma.product.update({
    where: { id: product.id },
    data: { profileJson: next as Prisma.InputJsonValue },
  });
  await prisma.applicationAsset.updateMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      type: { in: ["RESUME", "COVER_LETTER"] },
    },
    data: { staleReason: applicationAssetConfig.labels.newInformationAvailable },
  });
  return next;
}
