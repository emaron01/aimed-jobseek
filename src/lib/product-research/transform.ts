/**
 * Transform PRODUCT_AI response → app ProductSynthesisResult.
 * suggestedBuyerRoles are never persisted.
 */

import {
  parseCandidateProfile,
  type CandidateProfile,
  type ProfileExperienceRole,
  type ProfileFactItem,
  type ProvenanceRef,
} from "@/lib/product-research/candidate-profile";
import type {
  ProductAiResponse,
  ProductSynthesisResult,
} from "@/lib/product-research/contract";
import { fillMissingRoleDates } from "@/lib/product-research/role-dates";

function filterProvenance(
  refs: ProvenanceRef[],
  allowed?: Set<string>,
): ProvenanceRef[] {
  if (!allowed) return refs;
  return refs.filter((ref) => allowed.has(ref.sourceId));
}

function filterFactItem(
  item: ProfileFactItem,
  allowed?: Set<string>,
): ProfileFactItem {
  return {
    ...item,
    provenance: filterProvenance(item.provenance, allowed),
  };
}

function filterOptionalFact(
  item: ProfileFactItem | null | undefined,
  allowed?: Set<string>,
): ProfileFactItem | null {
  if (!item) return null;
  return filterFactItem(item, allowed);
}

function filterRole(
  role: ProfileExperienceRole,
  allowed?: Set<string>,
): ProfileExperienceRole {
  return {
    ...role,
    provenance: filterProvenance(role.provenance, allowed),
    achievements: role.achievements.map((item) => filterFactItem(item, allowed)),
  };
}

function filterCandidateProfile(
  profile: CandidateProfile,
  allowed?: Set<string>,
): CandidateProfile {
  return {
    ...profile,
    identity: {
      name: filterOptionalFact(profile.identity.name, allowed),
      headline: filterOptionalFact(profile.identity.headline, allowed),
      location: filterOptionalFact(profile.identity.location, allowed),
      email: filterOptionalFact(profile.identity.email, allowed),
      phone: filterOptionalFact(profile.identity.phone, allowed),
      cityState: filterOptionalFact(profile.identity.cityState, allowed),
      linkedinUrl: filterOptionalFact(profile.identity.linkedinUrl, allowed),
      personalSite: filterOptionalFact(profile.identity.personalSite, allowed),
      workArrangementPreference: filterOptionalFact(
        profile.identity.workArrangementPreference,
        allowed,
      ),
      relocationOpenness: filterOptionalFact(
        profile.identity.relocationOpenness,
        allowed,
      ),
    },
    positioning: filterOptionalFact(profile.positioning, allowed),
    direction: {
      targetTitles: profile.direction.targetTitles.map((item) =>
        filterFactItem(item, allowed),
      ),
      seniority: filterOptionalFact(profile.direction.seniority, allowed),
      functions: profile.direction.functions.map((item) =>
        filterFactItem(item, allowed),
      ),
      careerGoals: profile.direction.careerGoals.map((item) =>
        filterFactItem(item, allowed),
      ),
    },
    experience: profile.experience.map((role) => filterRole(role, allowed)),
    skills: profile.skills.map((item) => filterFactItem(item, allowed)),
    problemsSolved: profile.problemsSolved.map((item) =>
      filterFactItem(item, allowed),
    ),
    differentiators: profile.differentiators.map((item) =>
      filterFactItem(item, allowed),
    ),
    education: profile.education.map((item) => filterFactItem(item, allowed)),
    credentials: profile.credentials.map((item) => filterFactItem(item, allowed)),
    awards: profile.awards.map((item) => filterFactItem(item, allowed)),
    domainVocabulary: profile.domainVocabulary.map((item) =>
      filterFactItem(item, allowed),
    ),
    seekerStatedFacts: profile.seekerStatedFacts.map((item) =>
      filterFactItem(item, allowed),
    ),
    compensation: profile.compensation
      ? {
          ...profile.compensation,
          provenance: filterProvenance(profile.compensation.provenance, allowed),
        }
      : null,
    gaps: profile.gaps,
  };
}

export function transformProductAiResponse(
  ai: ProductAiResponse,
  options?: {
    allowedSourceIds?: Set<string>;
    sourceTexts?: Array<{ sourceId: string; text: string }>;
  },
): ProductSynthesisResult {
  const filtered = filterCandidateProfile(
    ai.candidateProfile,
    options?.allowedSourceIds,
  );
  const withDates = fillMissingRoleDates(
    filtered,
    options?.sourceTexts ?? [],
  ).profile;
  return {
    candidateProfile: parseCandidateProfile(withDates),
  };
}
