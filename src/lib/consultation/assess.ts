import {
  PERSON_PREP_TARGET_PREFIX,
  WHY_THIS_COMPANY_TARGET_KEY,
} from "@/lib/consultation/contract";
import type { JobScorecard } from "@/lib/job-requirement/types";
import type { CandidateProfile, ProfileFactItem } from "@/lib/product-research/candidate-profile";
import {
  experienceDateToMaximumMonthIndex,
  experienceDateToMonthIndex,
  parseExperienceDate,
} from "@/lib/product-research/role-dates";

export const EVIDENCE_STRENGTHS = ["STRONG", "PARTIAL", "NONE"] as const;
export type EvidenceStrengthName = (typeof EVIDENCE_STRENGTHS)[number];

export const GAP_STRATEGIES = [
  "PROVE_WITH_STORY",
  "REFRAME_ADJACENT",
  "ACKNOWLEDGE",
] as const;
export type GapStrategyName = (typeof GAP_STRATEGIES)[number];

export type EvidenceKind =
  | "REQUIRED"
  | "OUTCOME"
  | "COMPETENCY"
  | "MISSION"
  | "PREFERRED";

export type EvidenceTarget = {
  key: string;
  kind: EvidenceKind;
  text: string;
};

export type EvidenceSourceType = "profile" | "consultation";

export type ProfileFactRef = {
  id: string;
  kind: "FACT" | "INFERENCE";
  text: string;
  itemType: "ITEM" | "EXPERIENCE";
  source?: EvidenceSourceType;
  employer?: string | null;
  title?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  roleId?: string | null;
};

export function evidenceSourceOf(
  item: Pick<ProfileFactRef, "id" | "source">,
): EvidenceSourceType {
  if (item.source) return item.source;
  return item.id.startsWith("consult_") ? "consultation" : "profile";
}

export type ExperienceCalculation = {
  requiredYears: number;
  totalMonths: number;
  totalYears: number;
  maximumMonths: number;
  maximumYears: number;
  roleIds: string[];
  missingDateRoleIds: string[];
  periods: Array<{
    roleId: string;
    startDate: string;
    endDate: string;
    precision: "month" | "year" | "mixed";
  }>;
};

export type EvidenceAssessment = {
  key: string;
  kind: EvidenceKind;
  text: string;
  strength: EvidenceStrengthName;
  supportingFactIds: string[];
  strategy: GapStrategyName | null;
  explanation: string;
  strategyText: string;
  verification: {
    originalStrength: EvidenceStrengthName;
    invalidSupportingFactIds: string[];
    invalidRoleIds: string[];
    downgradeReasons: string[];
  };
  experienceCalculation: ExperienceCalculation | null;
};

const STOPWORDS = new Set([
  "with",
  "from",
  "that",
  "this",
  "your",
  "have",
  "been",
  "into",
  "over",
  "than",
  "them",
  "they",
  "their",
  "about",
  "using",
]);

function stem(token: string): string {
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(stem)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function pushItem(
  facts: ProfileFactRef[],
  item: ProfileFactItem | null | undefined,
  roleId?: string,
) {
  if (!item) return;
  const text = item.text.trim();
  if (!text) return;
  facts.push({
    id: item.id,
    kind: item.kind,
    text,
    itemType: "ITEM",
    source: evidenceSourceOf({ id: item.id }),
    roleId: roleId ?? null,
  });
}

/** All profile items are sent to the model with their kind; only FACT may support fit. */
export function profileEvidenceItems(profile: CandidateProfile): ProfileFactRef[] {
  const facts: ProfileFactRef[] = [];
  pushItem(facts, profile.identity.name);
  pushItem(facts, profile.identity.headline);
  pushItem(facts, profile.identity.location);
  pushItem(facts, profile.identity.email);
  pushItem(facts, profile.identity.phone);
  pushItem(facts, profile.identity.cityState);
  pushItem(facts, profile.identity.linkedinUrl);
  pushItem(facts, profile.identity.personalSite);
  pushItem(facts, profile.identity.workArrangementPreference);
  pushItem(facts, profile.identity.relocationOpenness);
  pushItem(facts, profile.positioning);
  profile.direction.targetTitles.forEach((item) => pushItem(facts, item));
  pushItem(facts, profile.direction.seniority);
  profile.direction.functions.forEach((item) => pushItem(facts, item));
  profile.direction.careerGoals.forEach((item) => pushItem(facts, item));
  for (const role of profile.experience) {
    const bits = [
      role.title,
      role.employer,
      role.startDate,
      role.endDate,
      role.location,
      role.summary,
    ].filter(
      (value): value is string => Boolean(value?.trim()),
    );
    if (bits.length > 0) {
      facts.push({
        id: role.id,
        kind: role.kind,
        text: bits.join(". "),
        itemType: "EXPERIENCE",
        source: evidenceSourceOf({ id: role.id }),
        employer: role.employer,
        title: role.title,
        startDate: role.startDate,
        endDate: role.endDate,
      });
    }
    role.achievements.forEach((item) => pushItem(facts, item, role.id));
  }
  profile.skills.forEach((item) => pushItem(facts, item));
  profile.problemsSolved.forEach((item) => pushItem(facts, item));
  profile.differentiators.forEach((item) => pushItem(facts, item));
  profile.education.forEach((item) => pushItem(facts, item));
  profile.credentials.forEach((item) => pushItem(facts, item));
  profile.domainVocabulary.forEach((item) => pushItem(facts, item));
  profile.seekerStatedFacts.forEach((item) => pushItem(facts, item));
  return facts;
}

/** FACT items only. INFERENCE items and compensation are not evidence. */
export function profileFactEvidence(profile: CandidateProfile): ProfileFactRef[] {
  return profileEvidenceItems(profile).filter((item) => item.kind === "FACT");
}

/** Stored on the shared profile by an older write. The id names the owning application. */
export function whyThisCompanyFactId(campaignId: string): string {
  return `why-this-company:${campaignId}`;
}

export function isWhyThisCompanyFactId(id: string): boolean {
  return id.startsWith("why-this-company:");
}

/**
 * Personal Profile evidence for one application.
 * Another application's why-this-company answer is omitted.
 * This application's answer is included from Campaign.whyThisCompany, or from
 * the matching stored fact when that field is empty.
 */
export function profileEvidenceForApplication(
  profile: CandidateProfile,
  input: { campaignId: string; whyThisCompany: string | null | undefined },
): ProfileFactRef[] {
  const ownId = whyThisCompanyFactId(input.campaignId);
  const items = profileEvidenceItems(profile).filter(
    (item) => !isWhyThisCompanyFactId(item.id) || item.id === ownId,
  );
  const text = input.whyThisCompany?.trim() ?? "";
  if (!text) return items;
  const existing = items.find((item) => item.id === ownId);
  if (!existing) {
    return [
      ...items,
      {
        id: ownId,
        kind: "FACT",
        text,
        itemType: "ITEM",
        source: "profile",
      },
    ];
  }
  if (existing.text === text) return items;
  return items.map((item) => (item.id === ownId ? { ...item, text } : item));
}

export function requirementMeaning(text: string): string {
  return contentTokens(text).join(" ");
}

export function sameRequirementMeaning(left: string, right: string): boolean {
  const leftTokens = new Set(contentTokens(left));
  const rightTokens = new Set(contentTokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return requirementMeaning(left) === requirementMeaning(right) &&
      requirementMeaning(left).length > 0;
  }
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = leftTokens.size + rightTokens.size - intersection;
  if (union > 0 && intersection / union >= 0.55) return true;
  const [smaller, larger] =
    leftTokens.size <= rightTokens.size
      ? [leftTokens, rightTokens]
      : [rightTokens, leftTokens];
  if (smaller.size < 2) return false;
  for (const token of smaller) {
    if (!larger.has(token)) return false;
  }
  return true;
}

function pushUniqueTarget(targets: EvidenceTarget[], next: EvidenceTarget): void {
  if (targets.some((existing) => sameRequirementMeaning(existing.text, next.text))) {
    return;
  }
  targets.push(next);
}

export function evidenceTargets(input: {
  scorecard: JobScorecard;
  requiredItems: string[];
  preferredItems: string[];
}): EvidenceTarget[] {
  const targets: EvidenceTarget[] = [];
  input.requiredItems.forEach((text, index) => {
    const trimmed = text.trim();
    if (trimmed && !looksLikeCompanyPitch(trimmed)) {
      pushUniqueTarget(targets, {
        key: `required:${index}`,
        kind: "REQUIRED",
        text: trimmed,
      });
    }
  });
  input.scorecard.outcomes.forEach((item) => {
    const trimmed = item.text.trim();
    if (trimmed && !looksLikeCompanyPitch(trimmed)) {
      pushUniqueTarget(targets, {
        key: `outcome:${item.id}`,
        kind: "OUTCOME",
        text: trimmed,
      });
    }
  });
  input.scorecard.competencies.forEach((item) => {
    const trimmed = item.text.trim();
    if (trimmed && !looksLikeCompanyPitch(trimmed)) {
      pushUniqueTarget(targets, {
        key: `competency:${item.id}`,
        kind: "COMPETENCY",
        text: trimmed,
      });
    }
  });
  if (input.scorecard.mission?.text.trim()) {
    const mission = input.scorecard.mission.text.trim();
    if (!looksLikeCompanyPitch(mission)) {
      pushUniqueTarget(targets, {
        key: `mission:${input.scorecard.mission.id}`,
        kind: "MISSION",
        text: mission,
      });
    }
  }
  input.preferredItems.forEach((text, index) => {
    const trimmed = text.trim();
    if (trimmed && !looksLikeCompanyPitch(trimmed)) {
      pushUniqueTarget(targets, {
        key: `preferred:${index}`,
        kind: "PREFERRED",
        text: trimmed,
      });
    }
  });
  return targets;
}

function formatMonthIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function yearsSkillText(text: string): string {
  return text
    .replace(
      /\b\d+(?:\.\d+)?\s*(?:to|[-–—])\s*\d+(?:\.\d+)?\+?\s*(?:years?|yrs?)\b/gi,
      " ",
    )
    .replace(/\b\d+(?:\.\d+)?\+?\s*(?:years?|yrs?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The role's stated text covers the skill in a years requirement, ignoring the year count. */
function statedExperienceCoversSkill(stated: string, skillText: string): boolean {
  if (sameRequirementMeaning(stated, skillText)) return true;
  const targetTokens = new Set(contentTokens(skillText));
  if (targetTokens.size < 2) return false;
  const evidenceTokens = new Set(contentTokens(stated));
  let hits = 0;
  for (const token of targetTokens) {
    if (evidenceTokens.has(token)) hits += 1;
  }
  return hits >= 2 && hits * 2 > targetTokens.size;
}

const COVERAGE_STOPWORDS = new Set([
  ...STOPWORDS,
  "year",
  "years",
  "experience",
  "required",
  "requirement",
  "including",
  "preferably",
  "progressive",
  "plus",
]);

/** Stem used only to match experience to a requirement. Not requirement de-duplication. */
function coverageStem(token: string): string {
  let value = token;
  if (value.length > 4 && value.endsWith("s") && !value.endsWith("ss")) {
    value = value.slice(0, -1);
  }
  if (value.length > 6 && value.endsWith("ing")) value = value.slice(0, -3);
  else if (value.length > 5 && value.endsWith("ed")) value = value.slice(0, -2);
  if (value.length > 6 && value.endsWith("er")) value = value.slice(0, -2);
  if (value.length > 4 && value.length <= 6 && value.endsWith("e")) {
    value = value.slice(0, -1);
  }
  return value;
}

function coverageTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map(coverageStem)
      .filter((token) => token.length >= 4 && !COVERAGE_STOPWORDS.has(token)),
  );
}

function evidenceCoversPart(evidence: string, part: string): boolean {
  const partTokens = coverageTokens(part);
  if (partTokens.size === 0) return false;
  const evidenceTokens = coverageTokens(evidence);
  let hits = 0;
  for (const token of partTokens) {
    if (evidenceTokens.has(token)) hits += 1;
  }
  if (partTokens.size === 1) return hits === 1;
  return hits >= 2 && hits * 2 > partTokens.size;
}

/**
 * Years are calculated from role dates. The writing model's relevantRoleIds
 * are ignored. Every FACT experience role whose title, summary, achievements,
 * school placement, internship, or project states the required experience is
 * included, in profile order. The same profile and requirement always select
 * the same roles.
 */
export function experienceRoleIdsForYearsTarget(input: {
  targetText: string;
  profileItems: readonly ProfileFactRef[];
  modelRoleIds: readonly string[];
}): string[] {
  void input.modelRoleIds;
  const skillText = yearsSkillText(input.targetText);
  const experience = input.profileItems.filter(
    (item) => item.kind === "FACT" && item.itemType === "EXPERIENCE",
  );
  const selected: string[] = [];
  for (const role of experience) {
    const related = input.profileItems
      .filter((item) => item.kind === "FACT" && item.roleId === role.id)
      .map((item) => item.text);
    const stated = [role.text, ...related].join(" ");
    if (!evidenceCoversPart(stated, skillText) && !statedExperienceCoversSkill(stated, skillText)) {
      continue;
    }
    selected.push(role.id);
  }
  return selected;
}

export function yearsRequirement(text: string): number | null {
  const match = text.match(/\b(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function mergeMonthRanges(
  ranges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of sorted) {
    const prior = merged.at(-1);
    if (!prior || range.start > prior.end + 1) {
      merged.push({ ...range });
    } else {
      prior.end = Math.max(prior.end, range.end);
    }
  }
  return merged;
}

function summedMonths(ranges: Array<{ start: number; end: number }>): number {
  return ranges.reduce((sum, range) => sum + (range.end - range.start + 1), 0);
}

export function calculateExperienceYears(input: {
  requiredYears: number;
  roleIds: string[];
  profileItems: ProfileFactRef[];
  asOf: Date;
}): ExperienceCalculation {
  const roleIds = [...new Set(input.roleIds)];
  const roles = roleIds
    .map((id) => input.profileItems.find((item) => item.id === id))
    .filter(
      (item): item is ProfileFactRef =>
        Boolean(item && item.itemType === "EXPERIENCE" && item.kind === "FACT"),
    );
  const missingDateRoleIds: string[] = [];
  const periods: ExperienceCalculation["periods"] = [];
  const conservativeRanges: Array<{ start: number; end: number }> = [];
  const maximumRanges: Array<{ start: number; end: number }> = [];
  const asOfLabel = formatMonthIndex(
    input.asOf.getUTCFullYear() * 12 + input.asOf.getUTCMonth(),
  );
  for (const role of roles) {
    const startParsed = role.startDate ? parseExperienceDate(role.startDate) : null;
    const endParsed = role.endDate
      ? parseExperienceDate(role.endDate)
      : {
          year: input.asOf.getUTCFullYear(),
          month: input.asOf.getUTCMonth() + 1,
          precision: "month" as const,
          raw: asOfLabel,
          present: true,
        };
    const conservativeStart = startParsed
      ? experienceDateToMonthIndex(startParsed, "start", input.asOf)
      : null;
    const conservativeEnd = endParsed
      ? experienceDateToMonthIndex(endParsed, "end", input.asOf)
      : null;
    const maximumStart = startParsed
      ? experienceDateToMaximumMonthIndex(startParsed, "start", input.asOf)
      : null;
    const maximumEnd = endParsed
      ? experienceDateToMaximumMonthIndex(endParsed, "end", input.asOf)
      : null;
    if (
      conservativeStart == null ||
      conservativeEnd == null ||
      maximumStart == null ||
      maximumEnd == null
    ) {
      missingDateRoleIds.push(role.id);
      continue;
    }
    if (conservativeEnd >= conservativeStart) {
      conservativeRanges.push({ start: conservativeStart, end: conservativeEnd });
    }
    if (maximumEnd >= maximumStart) {
      maximumRanges.push({ start: maximumStart, end: maximumEnd });
    }
    const startPrecision = startParsed?.precision ?? "month";
    const endPrecision = endParsed?.present ? "month" : endParsed?.precision ?? "month";
    periods.push({
      roleId: role.id,
      startDate: role.startDate ?? startParsed?.raw ?? asOfLabel,
      endDate: role.endDate ?? endParsed?.raw ?? asOfLabel,
      precision:
        startPrecision === "year" || endPrecision === "year" ? "year" : "month",
    });
  }
  const totalMonths = summedMonths(mergeMonthRanges(conservativeRanges));
  const maximumMonths = summedMonths(mergeMonthRanges(maximumRanges));
  return {
    requiredYears: input.requiredYears,
    totalMonths,
    totalYears: Number((totalMonths / 12).toFixed(1)),
    maximumMonths,
    maximumYears: Number((maximumMonths / 12).toFixed(1)),
    roleIds: roles.map((role) => role.id),
    missingDateRoleIds,
    periods,
  };
}

function downgrade(strength: EvidenceStrengthName): EvidenceStrengthName {
  if (strength === "STRONG") return "PARTIAL";
  if (strength === "PARTIAL") return "NONE";
  return "NONE";
}

export type ModelAssessment = {
  targetKey: string;
  strength: EvidenceStrengthName;
  supportingFactIds: string[];
  relevantRoleIds: string[];
  explanation: string;
  strategyMode: GapStrategyName;
  strategy: string;
};

/** Verifies model reasoning without writing replacement assessment or strategy prose. */
export function assessmentContradictsPrior(input: {
  previous: Pick<EvidenceAssessment, "explanation" | "supportingFactIds">;
  next: Pick<EvidenceAssessment, "explanation" | "supportingFactIds" | "verification">;
}): boolean {
  const explanation = `${input.next.explanation} ${input.next.verification.downgradeReasons.join(" ")}`;
  return /\b(?:no experience|never (?:installed|done|led|built|run)|do not have|don't have|not something i(?: have|'ve)?|contradicts? (?:the )?(?:earlier|prior|previous))\b/i.test(
    explanation,
  );
}

/** The current assessment is stored. An older rating does not replace it. */
export function preserveAssessmentStrength(input: {
  previous: EvidenceAssessment | undefined;
  next: EvidenceAssessment;
}): EvidenceAssessment {
  void input.previous;
  return input.next;
}

export function verifyModelAssessments(input: {
  targets: EvidenceTarget[];
  profileItems: ProfileFactRef[];
  assessments: ModelAssessment[];
  asOf: Date;
  previousAssessments?: EvidenceAssessment[];
}): EvidenceAssessment[] {
  const byKey = new Map(input.assessments.map((item) => [item.targetKey, item]));
  const itemsById = new Map(input.profileItems.map((item) => [item.id, item]));
  const previousByKey = new Map(
    (input.previousAssessments ?? []).map((item) => [item.key, item]),
  );
  return input.targets.map((target) => {
    const model = byKey.get(target.key);
    if (!model) {
      const previous = previousByKey.get(target.key);
      return (
        previous ?? {
          key: target.key,
          kind: target.kind,
          text: target.text,
          strength: "NONE" as const,
          supportingFactIds: [],
          strategy: "ACKNOWLEDGE" as const,
          explanation: "",
          strategyText: "",
          verification: {
            originalStrength: "NONE" as const,
            invalidSupportingFactIds: [],
            invalidRoleIds: [],
            downgradeReasons: [],
          },
          experienceCalculation: null,
        }
      );
    }
    let strength = model.strength;
    const validFactIds = model.supportingFactIds.filter(
      (id) => itemsById.get(id)?.kind === "FACT",
    );
    const invalidSupportingFactIds = model.supportingFactIds.filter(
      (id) => itemsById.get(id)?.kind !== "FACT",
    );
    const validRoleIds = model.relevantRoleIds.filter((id) => {
      const item = itemsById.get(id);
      return item?.kind === "FACT" && item.itemType === "EXPERIENCE";
    });
    const invalidRoleIds = model.relevantRoleIds.filter(
      (id) => !validRoleIds.includes(id),
    );
    const downgradeReasons: string[] = [];
    if (
      (strength === "STRONG" || strength === "PARTIAL") &&
      (invalidSupportingFactIds.length > 0 || validFactIds.length === 0)
    ) {
      strength = downgrade(strength);
      downgradeReasons.push("A cited supporting item was missing or was not FACT.");
    }
    if ((strength === "STRONG" || strength === "PARTIAL") && validFactIds.length === 0) {
      strength = "NONE";
    }
    const requiredYears = yearsRequirement(target.text);
    const roleIdsForYears =
      requiredYears == null
        ? validRoleIds
        : experienceRoleIdsForYearsTarget({
            targetText: target.text,
            profileItems: input.profileItems,
            modelRoleIds: validRoleIds,
          });
    const experienceCalculation =
      requiredYears == null
        ? null
        : calculateExperienceYears({
            requiredYears,
            roleIds: roleIdsForYears,
            profileItems: input.profileItems,
            asOf: input.asOf,
          });
    if (experienceCalculation && invalidRoleIds.length > 0) {
      strength = downgrade(strength);
      downgradeReasons.push("A cited experience role was missing or was not FACT.");
    }
    return preserveAssessmentStrength({
      previous: previousByKey.get(target.key),
      next: {
        key: target.key,
        kind: target.kind,
        text: target.text,
        strength,
        supportingFactIds: strength === "NONE" ? [] : validFactIds,
        strategy: model.strategyMode,
        explanation: model.explanation.trim(),
        strategyText: model.strategy.trim(),
        verification: {
          originalStrength: model.strength,
          invalidSupportingFactIds,
          invalidRoleIds,
          downgradeReasons,
        },
        experienceCalculation,
      },
    });
  });
}

const EXPLANATION_FULLY_MET =
  /\b(clearly meet|fully meets|fully meet|you meet|meets this|meets the|strong match|complete match|no gap|well covered)\b/i;
const EXPLANATION_CLAIMS_UNMET =
  /\b(missing|not stated|does not meet|doesn't meet|not covered|nothing stated|unmet)\b/i;

/**
 * The explanation claims a different rating than the strength that was saved.
 * Partial or None plus "you clearly meet" is the reported case.
 * Strong plus language that the requirement is unmet is the other direction.
 */
export function explanationContradictsStrength(
  strength: EvidenceStrengthName,
  explanation: string,
): boolean {
  const text = explanation.trim();
  if (!text) return false;
  if (strength === "STRONG") {
    return EXPLANATION_CLAIMS_UNMET.test(text) && !EXPLANATION_FULLY_MET.test(text);
  }
  return EXPLANATION_FULLY_MET.test(text);
}

const KIND_RANK: Record<EvidenceKind, number> = {
  REQUIRED: 0,
  OUTCOME: 1,
  COMPETENCY: 2,
  MISSION: 3,
  PREFERRED: 4,
};

const COMPANY_PITCH_OPENERS =
  /^(?:join us|come join(?: us)?|help us(?: to)?(?: build| protect| transform| shape| grow)|we(?:'re| are) (?:on a mission|building a|looking for people who|committed to|passionate about)|our mission (?:is|was) to|be part of (?:a|our)|help (?:us )?build the future)\b/i;

const COMPANY_PITCH_MARKERS = [
  /\bhelp protect the world\b/i,
  /\bworld(?:'s)? most valuable digital brands\b/i,
  /\bdefined by execution excellence\b/i,
  /\bour mission (?:is|was) to\b/i,
  /\bwe(?:'re| are) on a mission to\b/i,
  /\bjoin (?:our|a) (?:mission|team|company) to\b/i,
  /\btransform how (?:enterprises|companies|the world)\b/i,
  /\bbuild(?:ing)? the future of\b/i,
  /\bmost (?:innovative|trusted|valuable) (?:brands|companies|platforms)\b/i,
];

/** Recruiting pitches and taglines are not skills the seeker can have experience with. */
export function looksLikeCompanyPitch(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (COMPANY_PITCH_OPENERS.test(trimmed)) return true;
  if (COMPANY_PITCH_MARKERS.some((pattern) => pattern.test(trimmed))) return true;
  // Mission-like company statement: first-person plural purpose without a skill verb.
  if (
    /\b(?:we|our company|the company)\b/i.test(trimmed) &&
    /\b(?:mission|purpose|vision|believe|exist to|here to)\b/i.test(trimmed) &&
    !/\b(?:years?|experience|skill|proficien|ability to|manage|lead|own|deliver)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

export function isCompanyMissionOrTagline(item: {
  key: string;
  kind: EvidenceKind;
  text: string;
}): boolean {
  if (item.key === WHY_THIS_COMPANY_TARGET_KEY) return false;
  if (item.kind === "MISSION" || item.key.startsWith("mission:")) return true;
  return looksLikeCompanyPitch(item.text);
}

export function isInterviewerPrepTarget(item: {
  key: string;
  text: string;
}): boolean {
  if (item.key.startsWith(PERSON_PREP_TARGET_PREFIX)) return true;
  if (item.key.startsWith("interview-note-focus")) return true;
  return /prepares (?:the seeker|you) for\b/i.test(item.text);
}

export function isStandingRequirement(item: {
  key: string;
  kind: EvidenceKind;
  text: string;
}): boolean {
  return !isCompanyMissionOrTagline(item) && !isInterviewerPrepTarget(item);
}

export function openGaps(assessments: EvidenceAssessment[]): EvidenceAssessment[] {
  return assessments
    .filter((item) => item.strength !== "STRONG")
    .filter((item) => isStandingRequirement(item))
    .sort((a, b) => {
      const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
      if (byKind !== 0) return byKind;
      if (a.strength !== b.strength) return a.strength === "NONE" ? -1 : 1;
      return a.key.localeCompare(b.key);
    });
}

export function gapsAreCovered(
  assessments: EvidenceAssessment[],
  skippedKeys: ReadonlySet<string>,
): boolean {
  return assessments
    .filter((item) => item.kind !== "PREFERRED")
    .filter((item) => isStandingRequirement(item))
    .every((item) => item.strength === "STRONG" || skippedKeys.has(item.key));
}
