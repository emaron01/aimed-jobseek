import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { candidateProfileEditCopy } from "@/lib/product-config";
import type {
  CandidateProfile,
  ProfileExperienceRole,
  ProfileFactItem,
} from "@/lib/product-research/candidate-profile";

const PENDING_SEEKER_SOURCE = "pending-user-confirmation";

function withSeekerProvenance<T extends { provenance: Array<{ sourceId: string }> }>(
  item: T,
  sourceId: string,
): T {
  const kept = item.provenance.filter(
    (ref) => ref.sourceId !== PENDING_SEEKER_SOURCE,
  );
  const already = kept.some((ref) => ref.sourceId === sourceId);
  return {
    ...item,
    kind: "FACT" as const,
    provenance: already ? kept : [...kept, { sourceId }],
  };
}

function confirmFact(
  item: ProfileFactItem | null | undefined,
  sourceId: string,
): ProfileFactItem | null {
  if (!item?.text.trim()) return null;
  return withSeekerProvenance({ ...item, text: item.text.trim() }, sourceId);
}

function confirmFacts(
  items: ProfileFactItem[],
  sourceId: string,
): ProfileFactItem[] {
  return items
    .map((item) => confirmFact(item, sourceId))
    .filter((item): item is ProfileFactItem => Boolean(item));
}

function confirmRole(
  role: ProfileExperienceRole,
  sourceId: string,
): ProfileExperienceRole {
  return {
    ...withSeekerProvenance(role, sourceId),
    employer: role.employer?.trim() || null,
    title: role.title?.trim() || null,
    startDate: role.startDate?.trim() || null,
    endDate: role.endDate?.trim() || null,
    location: role.location?.trim() || null,
    summary: role.summary?.trim() || null,
    achievements: confirmFacts(role.achievements, sourceId),
    reasonForLeaving: confirmFact(role.reasonForLeaving, sourceId),
  };
}

/** Mark seeker-submitted facts as FACT with the given USER_NOTE source. */
export function applySeekerEditProvenance(
  profile: CandidateProfile,
  sourceId: string,
): CandidateProfile {
  return {
    ...profile,
    identity: {
      ...profile.identity,
      name: confirmFact(profile.identity.name, sourceId),
      headline: confirmFact(profile.identity.headline, sourceId),
      location: confirmFact(profile.identity.location, sourceId),
      email: confirmFact(profile.identity.email, sourceId),
      phone: confirmFact(profile.identity.phone, sourceId),
      cityState: confirmFact(profile.identity.cityState, sourceId),
      linkedinUrl: confirmFact(profile.identity.linkedinUrl, sourceId),
      personalSite: confirmFact(profile.identity.personalSite, sourceId),
      workArrangementPreference: confirmFact(
        profile.identity.workArrangementPreference,
        sourceId,
      ),
      relocationOpenness: confirmFact(
        profile.identity.relocationOpenness,
        sourceId,
      ),
    },
    positioning: confirmFact(profile.positioning, sourceId),
    direction: {
      targetTitles: confirmFacts(profile.direction.targetTitles, sourceId),
      seniority: confirmFact(profile.direction.seniority, sourceId),
      functions: confirmFacts(profile.direction.functions, sourceId),
      careerGoals: confirmFacts(profile.direction.careerGoals, sourceId),
    },
    experience: profile.experience.map((role) => confirmRole(role, sourceId)),
    skills: confirmFacts(profile.skills, sourceId),
    problemsSolved: confirmFacts(profile.problemsSolved, sourceId),
    differentiators: confirmFacts(profile.differentiators, sourceId),
    education: confirmFacts(profile.education, sourceId),
    credentials: confirmFacts(profile.credentials, sourceId),
    awards: confirmFacts(profile.awards, sourceId),
    domainVocabulary: confirmFacts(profile.domainVocabulary, sourceId),
    seekerStatedFacts: confirmFacts(profile.seekerStatedFacts, sourceId),
    compensation: profile.compensation
      ? {
          ...profile.compensation,
          text: profile.compensation.text?.trim() || null,
        }
      : null,
    gaps: profile.gaps,
  };
}

/**
 * Persist a seeker save as FACT items with a USER_NOTE source so rebuilds
 * can treat those fields as seeker-owned.
 */
export async function confirmSeekerProfileEdits(input: {
  organizationId: string;
  productId: string;
  userId: string;
  profile: CandidateProfile;
}): Promise<CandidateProfile> {
  const text = JSON.stringify(input.profile);
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
        displayName: candidateProfileEditCopy.seekerEditSource,
        acquisitionMethod: "USER_CONFIRMED",
        createdByUserId: input.userId,
        contentHash,
        status: "EXTRACTED",
        extractedText: text,
        retrievedAt: new Date(),
      },
      select: { id: true },
    }));
  return applySeekerEditProvenance(input.profile, source.id);
}

export function mergeManuallyEditedFields(
  current: unknown,
  newlyEdited: string[],
): string[] {
  const previous = Array.isArray(current)
    ? current.map(String).filter(Boolean)
    : [];
  return [...new Set([...previous, ...newlyEdited])];
}
