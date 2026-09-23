import { createHash } from "node:crypto";
import type { CandidateProfile, ProfileFactItem } from "./candidate-profile";
import { applicationAssetConfig } from "@/lib/product-config";
import { prisma } from "@/lib/prisma";

const CONTACT_KEYS = [
  "email",
  "phone",
  "cityState",
  "linkedinUrl",
  "personalSite",
] as const;

export type ProfileContactKey = (typeof CONTACT_KEYS)[number];

function contactText(profile: CandidateProfile): string {
  return CONTACT_KEYS.flatMap((key) => {
    const text = profile.identity[key]?.text.trim();
    return text ? [`${key}: ${text}`] : [];
  }).join("\n");
}

function confirmedItem(
  item: ProfileFactItem | null | undefined,
  sourceId: string,
): ProfileFactItem | null {
  if (!item?.text.trim()) return null;
  return {
    ...item,
    kind: "FACT",
    provenance: [
      ...item.provenance.filter((ref) => ref.sourceId !== "pending-user-confirmation"),
      ...(item.provenance.some((ref) => ref.sourceId === sourceId)
        ? []
        : [{ sourceId }]),
    ],
  };
}

/**
 * Approval is the seeker's explicit confirmation of profile contact details.
 * The confirmation is persisted as a USER_NOTE source so each field is a traceable FACT.
 */
export async function confirmProfileContactDetails(input: {
  organizationId: string;
  productId: string;
  userId: string;
  profile: CandidateProfile;
}): Promise<CandidateProfile> {
  const text = contactText(input.profile);
  if (!text) return input.profile;
  const contentHash = createHash("sha256").update(text).digest("hex");
  const existing = await prisma.productSource.findUnique({
    where: {
      organizationId_productId_contentHash: {
        organizationId: input.organizationId,
        productId: input.productId,
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
        productId: input.productId,
        sourceType: "USER_NOTE",
        displayName: applicationAssetConfig.contactDetailsSourceLabel,
        acquisitionMethod: "USER_CONFIRMED",
        createdByUserId: input.userId,
        contentHash,
        status: "EXTRACTED",
        extractedText: text,
        retrievedAt: new Date(),
      },
      select: { id: true },
    }));
  return {
    ...input.profile,
    identity: {
      ...input.profile.identity,
      email: confirmedItem(input.profile.identity.email, source.id),
      phone: confirmedItem(input.profile.identity.phone, source.id),
      cityState: confirmedItem(input.profile.identity.cityState, source.id),
      linkedinUrl: confirmedItem(input.profile.identity.linkedinUrl, source.id),
      personalSite: confirmedItem(input.profile.identity.personalSite, source.id),
    },
  };
}
