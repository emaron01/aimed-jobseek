import type { CandidateProfile, ProfileFactItem } from "@/lib/product-research/candidate-profile";
import type { JobScorecard } from "@/lib/job-requirement/types";

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

export type ProfileFactRef = {
  id: string;
  text: string;
};

export type EvidenceAssessment = {
  key: string;
  kind: EvidenceKind;
  text: string;
  strength: EvidenceStrengthName;
  supportingFactIds: string[];
  strategy: GapStrategyName | null;
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

function pushFact(facts: ProfileFactRef[], item: ProfileFactItem | null | undefined) {
  if (!item || item.kind !== "FACT") return;
  const text = item.text.trim();
  if (!text) return;
  facts.push({ id: item.id, text });
}

/** FACT items only. INFERENCE items and compensation are not evidence. */
export function profileFactEvidence(profile: CandidateProfile): ProfileFactRef[] {
  const facts: ProfileFactRef[] = [];
  pushFact(facts, profile.identity.name);
  pushFact(facts, profile.identity.headline);
  pushFact(facts, profile.identity.location);
  pushFact(facts, profile.identity.workArrangementPreference);
  pushFact(facts, profile.identity.relocationOpenness);
  pushFact(facts, profile.positioning);
  profile.direction.targetTitles.forEach((item) => pushFact(facts, item));
  pushFact(facts, profile.direction.seniority);
  profile.direction.functions.forEach((item) => pushFact(facts, item));
  profile.direction.careerGoals.forEach((item) => pushFact(facts, item));
  for (const role of profile.experience) {
    if (role.kind === "FACT") {
      const bits = [role.title, role.employer, role.summary].filter(
        (value): value is string => Boolean(value?.trim()),
      );
      if (bits.length > 0) {
        facts.push({ id: role.id, text: bits.join(". ") });
      }
    }
    role.achievements.forEach((item) => pushFact(facts, item));
  }
  profile.skills.forEach((item) => pushFact(facts, item));
  profile.problemsSolved.forEach((item) => pushFact(facts, item));
  profile.differentiators.forEach((item) => pushFact(facts, item));
  profile.education.forEach((item) => pushFact(facts, item));
  profile.credentials.forEach((item) => pushFact(facts, item));
  profile.domainVocabulary.forEach((item) => pushFact(facts, item));
  return facts;
}

export function evidenceTargets(input: {
  scorecard: JobScorecard;
  requiredItems: string[];
  preferredItems: string[];
}): EvidenceTarget[] {
  const targets: EvidenceTarget[] = [];
  input.requiredItems.forEach((text, index) => {
    if (text.trim()) {
      targets.push({ key: `required:${index}`, kind: "REQUIRED", text: text.trim() });
    }
  });
  input.scorecard.outcomes.forEach((item) => {
    if (item.text.trim()) {
      targets.push({ key: `outcome:${item.id}`, kind: "OUTCOME", text: item.text.trim() });
    }
  });
  input.scorecard.competencies.forEach((item) => {
    if (item.text.trim()) {
      targets.push({
        key: `competency:${item.id}`,
        kind: "COMPETENCY",
        text: item.text.trim(),
      });
    }
  });
  if (input.scorecard.mission?.text.trim()) {
    targets.push({
      key: `mission:${input.scorecard.mission.id}`,
      kind: "MISSION",
      text: input.scorecard.mission.text.trim(),
    });
  }
  input.preferredItems.forEach((text, index) => {
    if (text.trim()) {
      targets.push({ key: `preferred:${index}`, kind: "PREFERRED", text: text.trim() });
    }
  });
  return targets;
}

function overlapCount(requirement: string[], fact: string[]): number {
  const factTokens = new Set(fact);
  return requirement.filter((token) => factTokens.has(token)).length;
}

export function assessEvidence(input: {
  targets: EvidenceTarget[];
  facts: ProfileFactRef[];
}): EvidenceAssessment[] {
  return input.targets.map((target) => {
    const requirementTokens = contentTokens(target.text);
    let bestIds: string[] = [];
    let bestShared = 0;
    let anyShared = 0;
    for (const fact of input.facts) {
      const shared = overlapCount(requirementTokens, contentTokens(fact.text));
      if (shared > anyShared) anyShared = shared;
      if (shared > bestShared) {
        bestShared = shared;
        bestIds = [fact.id];
      } else if (shared > 0 && shared === bestShared) {
        bestIds.push(fact.id);
      }
    }
    const coverage =
      requirementTokens.length === 0 ? 0 : bestShared / requirementTokens.length;
    const strong =
      bestShared > 0 &&
      coverage >= 0.5 &&
      (requirementTokens.length < 2 || bestShared >= 2);
    const partial =
      !strong &&
      bestShared > 0 &&
      (bestShared >= 2 || coverage >= 0.34);
    const strength: EvidenceStrengthName = strong
      ? "STRONG"
      : partial
        ? "PARTIAL"
        : "NONE";
    const strategy: GapStrategyName | null =
      strength === "STRONG"
        ? null
        : strength === "PARTIAL"
          ? "PROVE_WITH_STORY"
          : anyShared > 0
            ? "REFRAME_ADJACENT"
            : "ACKNOWLEDGE";
    return {
      key: target.key,
      kind: target.kind,
      text: target.text,
      strength,
      supportingFactIds: strength === "NONE" ? [] : bestIds,
      strategy,
    };
  });
}

const KIND_RANK: Record<EvidenceKind, number> = {
  REQUIRED: 0,
  OUTCOME: 1,
  COMPETENCY: 2,
  MISSION: 3,
  PREFERRED: 4,
};

export function openGaps(assessments: EvidenceAssessment[]): EvidenceAssessment[] {
  return assessments
    .filter((item) => item.strength !== "STRONG")
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
    .every((item) => item.strength === "STRONG" || skippedKeys.has(item.key));
}
