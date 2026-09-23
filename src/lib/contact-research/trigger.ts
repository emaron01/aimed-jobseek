import type { ContactResearch } from "@prisma/client";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import { vocab } from "@/lib/product-config";

export type ContactResearchTriggerResult = {
  needed: boolean;
  reason: string;
  reuseExisting?: boolean;
};

/** Executive and clearly scoped VP titles — title alone is usually sufficient. */
export const UNAMBIGUOUS_TITLE_PATTERNS: RegExp[] = [
  /\bceo\b/i,
  /\bchief executive\b/i,
  /\bcro\b/i,
  /\bchief revenue officer\b/i,
  /\bcmo\b/i,
  /\bchief marketing officer\b/i,
  /\bcfo\b/i,
  /\bchief financial officer\b/i,
  /\bcto\b/i,
  /\bchief technology officer\b/i,
  /\bchief technical officer\b/i,
  /\bcoo\b/i,
  /\bchief operating officer\b/i,
  /\bchief\s+\w+\s+officer\b/i,
  /\bvp\s+sales\b/i,
  /\bvice president\s+sales\b/i,
  /\bvp\s+marketing\b/i,
  /\bvice president\s+marketing\b/i,
];

/** Titles where function/ownership is unclear without deeper research. */
export const AMBIGUOUS_TITLE_PATTERNS: RegExp[] = [
  /\bvp\s+infrastructure\b/i,
  /\bvice president\s+infrastructure\b/i,
  /\bvp\s+operations\b/i,
  /\bvice president\s+operations\b/i,
  /\bdirector\s+technology\b/i,
  /\bvp\s+strategy\b/i,
  /\bvice president\s+strategy\b/i,
  /\bhead\s+of\s+transformation\b/i,
  /\bhead\s+of\s+infrastructure\b/i,
];

function normalizeTitle(title: string | null | undefined): string {
  return (title ?? "").trim();
}

function matchesAny(title: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(title));
}

function personaIsSalesOrMarketing(personaCriteria: CriterionSnapshot[]): boolean {
  for (const c of personaCriteria) {
    const blob = [
      c.name,
      c.criterionType,
      c.description,
      String(c.targetValue ?? ""),
    ]
      .join(" ")
      .toLowerCase();
    if (
      blob.includes("sales") ||
      blob.includes("marketing") ||
      blob.includes("revenue") ||
      blob.includes("go-to-market") ||
      blob.includes("gtm")
    ) {
      return true;
    }
  }
  return false;
}

function hasResponsibilityCriteria(
  personaCriteria: CriterionSnapshot[],
): boolean {
  return personaCriteria.some((c) => {
    const type = c.criterionType.toLowerCase();
    return (
      type.includes("responsib") ||
      type.includes("ownership") ||
      type.includes("own")
    );
  });
}

function isFreshContactResearch(
  existing: Pick<
    ContactResearch,
    "researchedAt" | "confidence" | "roleSummary" | "status"
  >,
  freshnessDays: number,
  now: Date = new Date(),
): boolean {
  if (!existing.researchedAt || !existing.roleSummary?.trim()) return false;
  if (existing.confidence !== "HIGH" && existing.confidence !== "MEDIUM") {
    return false;
  }
  if (existing.status !== "COMPLETED" && existing.status !== "PARTIAL") {
    return false;
  }
  const ageMs = now.getTime() - existing.researchedAt.getTime();
  return ageMs <= freshnessDays * 24 * 60 * 60 * 1000;
}

function isUnambiguousTitle(
  title: string,
  personaCriteria: CriterionSnapshot[],
): boolean {
  if (matchesAny(title, UNAMBIGUOUS_TITLE_PATTERNS)) {
    if (/\bvp\s+(sales|marketing)\b/i.test(title)) {
      return personaIsSalesOrMarketing(personaCriteria);
    }
    if (/\bchief\s/i.test(title) || /\bceo\b/i.test(title)) {
      return true;
    }
    return true;
  }
  return false;
}

/**
 * Deterministic progressive trigger for contact-role research.
 * Research is skipped when title is unambiguous or fresh research already exists.
 */
export function shouldResearchContactRole(input: {
  title: string | null | undefined;
  personaCriteria: CriterionSnapshot[];
  existingResearch?: Pick<
    ContactResearch,
    "researchedAt" | "confidence" | "roleSummary" | "status"
  > | null;
  freshnessDays?: number;
}): ContactResearchTriggerResult {
  const title = normalizeTitle(input.title);
  const freshnessDays = input.freshnessDays ?? 90;

  if (
    input.existingResearch &&
    isFreshContactResearch(input.existingResearch, freshnessDays)
  ) {
    return {
      needed: false,
      reason: `Fresh ${vocab.contact.singular} research with sufficient confidence already exists.`,
      reuseExisting: true,
    };
  }

  if (!title) {
    if (hasResponsibilityCriteria(input.personaCriteria)) {
      return {
        needed: true,
        reason: `No title provided but ${vocab.persona.singular} requires responsibility evidence.`,
      };
    }
    return {
      needed: true,
      reason: "No title available to infer role.",
    };
  }

  if (matchesAny(title, AMBIGUOUS_TITLE_PATTERNS)) {
    return {
      needed: true,
      reason: `Title "${title}" is ambiguous — responsibilities require verification.`,
    };
  }

  if (isUnambiguousTitle(title, input.personaCriteria)) {
    return {
      needed: false,
      reason: `Title "${title}" is an unambiguous executive or scoped VP role.`,
    };
  }

  if (hasResponsibilityCriteria(input.personaCriteria)) {
    return {
      needed: true,
      reason:
        `${vocab.persona.Singular} includes responsibility/ownership criteria — title alone is insufficient.`,
    };
  }

  return {
    needed: false,
    reason: `Title appears sufficient and ${vocab.persona.singular} has no responsibility criteria.`,
  };
}
