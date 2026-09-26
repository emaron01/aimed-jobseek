import {
  emptyCandidateProfile,
  parseCandidateProfileSafe,
  type CandidateProfile,
} from "@/lib/product-research/candidate-profile";
import {
  CANDIDATE_PROFILE_FIELD_LABELS,
  CANDIDATE_PROFILE_FIELD_PATHS,
  diffCandidateProfileFields,
  type CandidateProfileFieldPath,
} from "@/lib/product-research/review";
import { vocab } from "@/lib/product-config";

export type ProductResynthesisApplyPlanItem = {
  label: string;
  detail?: string;
};

export type ProductResynthesisFieldDiff = {
  field: string;
  label: string;
  before: string;
  after: string;
};

export type ProductResynthesisApplyPlan = {
  preserved: ProductResynthesisApplyPlanItem[];
  replaced: ProductResynthesisApplyPlanItem[];
  fieldDiffs: ProductResynthesisFieldDiff[];
};

function asManualFieldList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function sectionValue(
  profile: CandidateProfile,
  path: CandidateProfileFieldPath,
): unknown {
  switch (path) {
    case "identity.name":
      return profile.identity.name;
    case "identity.headline":
      return profile.identity.headline;
    case "identity.location":
      return profile.identity.location;
    case "identity.email":
      return profile.identity.email;
    case "identity.phone":
      return profile.identity.phone;
    case "identity.cityState":
      return profile.identity.cityState;
    case "identity.linkedinUrl":
      return profile.identity.linkedinUrl;
    case "identity.personalSite":
      return profile.identity.personalSite;
    case "identity.workArrangementPreference":
      return profile.identity.workArrangementPreference;
    case "identity.relocationOpenness":
      return profile.identity.relocationOpenness;
    case "positioning":
      return profile.positioning;
    case "direction.targetTitles":
      return profile.direction.targetTitles;
    case "direction.seniority":
      return profile.direction.seniority;
    case "direction.functions":
      return profile.direction.functions;
    case "direction.careerGoals":
      return profile.direction.careerGoals;
    case "experience":
      return profile.experience;
    case "skills":
      return profile.skills;
    case "problemsSolved":
      return profile.problemsSolved;
    case "differentiators":
      return profile.differentiators;
    case "education":
      return profile.education;
    case "credentials":
      return profile.credentials;
    case "awards":
      return profile.awards;
    case "domainVocabulary":
      return profile.domainVocabulary;
    case "gaps":
      return profile.gaps;
    default: {
      const _exhaustive: never = path;
      return _exhaustive;
    }
  }
}

function fieldTextValue(profile: CandidateProfile, field: string): string {
  if ((CANDIDATE_PROFILE_FIELD_PATHS as readonly string[]).includes(field)) {
    return JSON.stringify(
      sectionValue(profile, field as CandidateProfileFieldPath),
      null,
      2,
    );
  }
  return "";
}

function setSectionValue(
  profile: CandidateProfile,
  path: CandidateProfileFieldPath,
  value: unknown,
): CandidateProfile {
  const next: CandidateProfile = {
    ...profile,
    identity: { ...profile.identity },
    direction: { ...profile.direction },
  };
  switch (path) {
    case "identity.name":
      next.identity.name = value as CandidateProfile["identity"]["name"];
      break;
    case "identity.headline":
      next.identity.headline = value as CandidateProfile["identity"]["headline"];
      break;
    case "identity.location":
      next.identity.location = value as CandidateProfile["identity"]["location"];
      break;
    case "identity.email":
      next.identity.email = value as CandidateProfile["identity"]["email"];
      break;
    case "identity.phone":
      next.identity.phone = value as CandidateProfile["identity"]["phone"];
      break;
    case "identity.cityState":
      next.identity.cityState =
        value as CandidateProfile["identity"]["cityState"];
      break;
    case "identity.linkedinUrl":
      next.identity.linkedinUrl =
        value as CandidateProfile["identity"]["linkedinUrl"];
      break;
    case "identity.personalSite":
      next.identity.personalSite =
        value as CandidateProfile["identity"]["personalSite"];
      break;
    case "identity.workArrangementPreference":
      next.identity.workArrangementPreference =
        value as CandidateProfile["identity"]["workArrangementPreference"];
      break;
    case "identity.relocationOpenness":
      next.identity.relocationOpenness =
        value as CandidateProfile["identity"]["relocationOpenness"];
      break;
    case "positioning":
      next.positioning = value as CandidateProfile["positioning"];
      break;
    case "direction.targetTitles":
      next.direction.targetTitles =
        value as CandidateProfile["direction"]["targetTitles"];
      break;
    case "direction.seniority":
      next.direction.seniority =
        value as CandidateProfile["direction"]["seniority"];
      break;
    case "direction.functions":
      next.direction.functions =
        value as CandidateProfile["direction"]["functions"];
      break;
    case "direction.careerGoals":
      next.direction.careerGoals =
        value as CandidateProfile["direction"]["careerGoals"];
      break;
    case "experience":
      next.experience = value as CandidateProfile["experience"];
      break;
    case "skills":
      next.skills = value as CandidateProfile["skills"];
      break;
    case "problemsSolved":
      next.problemsSolved = value as CandidateProfile["problemsSolved"];
      break;
    case "differentiators":
      next.differentiators = value as CandidateProfile["differentiators"];
      break;
    case "education":
      next.education = value as CandidateProfile["education"];
      break;
    case "credentials":
      next.credentials = value as CandidateProfile["credentials"];
      break;
    case "awards":
      next.awards = value as CandidateProfile["awards"];
      break;
    case "domainVocabulary":
      next.domainVocabulary = value as CandidateProfile["domainVocabulary"];
      break;
    case "gaps":
      next.gaps = value as CandidateProfile["gaps"];
      break;
    default: {
      const _exhaustive: never = path;
      return _exhaustive;
    }
  }
  return next;
}

export function productDraftFromApprovedProfile(
  profileJson: unknown,
): CandidateProfile {
  const parsed = parseCandidateProfileSafe(profileJson);
  return parsed.ok ? parsed.profile : emptyCandidateProfile();
}

export function buildProductResynthesisApplyPlan(input: {
  product: {
    id: string;
    name: string;
    manuallyEditedFields: unknown;
  };
  before: CandidateProfile;
  after: CandidateProfile;
}): ProductResynthesisApplyPlan {
  const preserved: ProductResynthesisApplyPlanItem[] = [
    {
      label: `${vocab.product.Singular} id`,
      detail: `${input.product.id} — ${vocab.campaign.plural}, ${vocab.icp.plural}, and scoring runs stay linked.`,
    },
    {
      label: `${vocab.product.Singular} name`,
      detail: input.product.name,
    },
  ];

  const manualFields = asManualFieldList(input.product.manuallyEditedFields);
  for (const field of manualFields) {
    const value = fieldTextValue(input.before, field);
    preserved.push({
      label:
        CANDIDATE_PROFILE_FIELD_LABELS[
          field as keyof typeof CANDIDATE_PROFILE_FIELD_LABELS
        ] ?? field,
      detail: value.trim() || "(empty)",
    });
  }

  const replaced: ProductResynthesisApplyPlanItem[] = [];
  const fieldDiffs: ProductResynthesisFieldDiff[] = [];
  const changedFields = diffCandidateProfileFields(input.before, input.after);

  for (const field of changedFields) {
    if (manualFields.includes(field)) continue;
    const before = fieldTextValue(input.before, field);
    const after = fieldTextValue(input.after, field);
    fieldDiffs.push({
      field,
      label:
        CANDIDATE_PROFILE_FIELD_LABELS[
          field as keyof typeof CANDIDATE_PROFILE_FIELD_LABELS
        ] ?? field,
      before,
      after,
    });
    replaced.push({
      label:
        CANDIDATE_PROFILE_FIELD_LABELS[
          field as keyof typeof CANDIDATE_PROFILE_FIELD_LABELS
        ] ?? field,
    });
  }

  return { preserved, replaced, fieldDiffs };
}

export function mergeProtectedProductDraftFields(input: {
  current: CandidateProfile;
  proposed: CandidateProfile;
  manuallyEditedFields: unknown;
}): CandidateProfile {
  const manualFields = asManualFieldList(input.manuallyEditedFields);
  let merged = input.proposed;

  for (const field of manualFields) {
    if (!(CANDIDATE_PROFILE_FIELD_PATHS as readonly string[]).includes(field)) {
      continue;
    }
    merged = setSectionValue(
      merged,
      field as CandidateProfileFieldPath,
      sectionValue(input.current, field as CandidateProfileFieldPath),
    );
  }

  return merged;
}
