/**
 * Claim origin: only MODEL_ORIGINATED inventions are the guard's business.
 * Rep assertions (offer, guidance, edits) and evidence-backed claims are silent.
 */
import { campaignOfferText } from "@/lib/campaign/offer-validation";
import type { ClaimValidationViolation } from "@/lib/email-generation/claim-validation-contract";

export type ClaimOrigin =
  | "REP_ASSERTED"
  | "CONSULTATION_ANSWER"
  | "EVIDENCE_SUPPORTED"
  | "MODEL_ORIGINATED";

/** Seeker-authored consultation answers. Trusted the same way as rep text. */
export type ConsultationClaimSource = {
  id: string;
  text: string;
  seekerAuthored: true;
};

export type RepClaimSources = {
  offerText: string;
  emailGuidance: string | null;
  regenerationGuidance: string | null;
  /** Body/subject text the rep introduced vs the last AI generatedBody (edit delta). */
  repEditText?: string | null;
};

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "for",
  "from",
  "in",
  "is",
  "it",
  "my",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "these",
  "this",
  "to",
  "with",
  "you",
  "your",
]);

export function normalizedClaimText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9$%]+/g, " ")
    .trim();
}

export function claimContentTokens(value: string): string[] {
  return normalizedClaimText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/**
 * Sentences in the current body that are not present in the last AI generatedBody.
 * Those are rep-owned edits and must never be flagged.
 */
export function computeRepEditDelta(
  generatedBody: string | null | undefined,
  currentBody: string,
): string {
  const current = currentBody.trim();
  if (!current) return "";
  const generated = (generatedBody ?? "").trim();
  if (!generated) return current;
  const generatedNorm = normalizedClaimText(generated);
  const sentences = current
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return sentences
    .filter((sentence) => {
      const norm = normalizedClaimText(sentence);
      if (norm.length < 4) return false;
      return !generatedNorm.includes(norm);
    })
    .join("\n");
}

/**
 * Deterministic leakage: excluded research signals appearing in copy.
 * These fields are stripped from the generation prompt; any appearance is model leakage.
 */
export function deterministicSignalLeakageViolations(input: {
  body: string;
  riskSignals: string[];
  professionalSignals: string[];
  negativeRoleSignals: string[];
  repSources: RepClaimSources;
}): ClaimValidationViolation[] {
  const bodyNormalized = normalizedClaimText(input.body);
  const repNormalized = normalizedClaimText(combinedRepSourceText(input.repSources));
  const violations: ClaimValidationViolation[] = [];

  const check = (
    signals: string[],
    label: string,
  ) => {
    for (const signal of signals) {
      const signalNormalized = normalizedClaimText(signal);
      if (signalNormalized.length < 4) continue;
      if (!bodyNormalized.includes(signalNormalized)) continue;
      if (repNormalized.includes(signalNormalized)) continue;
      violations.push({
        type: "UNSUPPORTED_FACT",
        description: `Generated copy leaks an excluded ${label}: ${signal}`,
        matchedGuard: signal,
        bodyExcerpt: signal,
        origin: "MODEL_ORIGINATED",
      });
    }
  };

  check(input.riskSignals, "risk signal");
  check(input.professionalSignals, "professional signal");
  check(input.negativeRoleSignals, "negative role signal");
  return violations;
}

export function buildRepClaimSources(input: {
  offer: {
    offerName?: string | null;
    offerDescription?: string | null;
    offerCta?: string | null;
    offerNotes?: string | null;
  };
  emailGuidance?: string | null;
  regenerationGuidance?: string | null;
  repEditText?: string | null;
}): RepClaimSources {
  return {
    offerText: campaignOfferText({
      offerName: input.offer.offerName ?? null,
      offerDescription: input.offer.offerDescription ?? null,
      offerCta: input.offer.offerCta ?? null,
      offerNotes: input.offer.offerNotes ?? null,
    }),
    emailGuidance: input.emailGuidance?.trim() || null,
    regenerationGuidance: input.regenerationGuidance?.trim() || null,
    repEditText: input.repEditText?.trim() || null,
  };
}

export function combinedRepSourceText(sources: RepClaimSources): string {
  return [
    sources.offerText,
    sources.emailGuidance,
    sources.regenerationGuidance,
    sources.repEditText,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");
}

function textOverlapsRepSource(
  assertionText: string,
  repText: string,
): boolean {
  const assertionNorm = normalizedClaimText(assertionText);
  const repNorm = normalizedClaimText(repText);
  if (!assertionNorm || !repNorm) return false;
  if (assertionNorm.length >= 4 && repNorm.includes(assertionNorm)) return true;
  if (repNorm.length >= 4 && assertionNorm.includes(repNorm)) return true;

  const assertionTokens = claimContentTokens(assertionText);
  const repTokens = new Set(claimContentTokens(repText));
  if (assertionTokens.length === 0 || repTokens.size === 0) return false;
  const overlap = assertionTokens.filter((token) => repTokens.has(token));
  // Paraphrases of rep guidance (e.g. "visited my website" → "visited our website").
  return overlap.length >= 2 && overlap.length / assertionTokens.length >= 0.5;
}

/** True when the assertion text (or guard phrase) traces to rep-owned input. */
export function isTraceableToRepInput(
  assertion: {
    description?: string | null;
    matchedGuard?: string | null;
    bodyExcerpt?: string | null;
  },
  sources: RepClaimSources,
): boolean {
  const repText = combinedRepSourceText(sources);
  if (!repText.trim()) return false;
  const needles = [
    assertion.bodyExcerpt,
    assertion.matchedGuard,
    assertion.description,
  ].filter((value): value is string => Boolean(value?.trim()));
  return needles.some((needle) => textOverlapsRepSource(needle, repText));
}

export function isTraceableToEvidence(
  assertion: {
    description?: string | null;
    matchedGuard?: string | null;
    bodyExcerpt?: string | null;
  },
  evidenceTexts: string[],
): boolean {
  const evidenceText = evidenceTexts.join("\n");
  if (!evidenceText.trim()) return false;
  const needles = [assertion.bodyExcerpt, assertion.matchedGuard].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  return needles.some((needle) => textOverlapsRepSource(needle, evidenceText));
}

export function isTraceableToConsultationAnswer(
  assertion: {
    description?: string | null;
    matchedGuard?: string | null;
    bodyExcerpt?: string | null;
  },
  sources: ConsultationClaimSource[],
): boolean {
  const texts = sources
    .filter((source) => source.seekerAuthored && source.text.trim())
    .map((source) => source.text);
  if (texts.length === 0) return false;
  const needles = [
    assertion.bodyExcerpt,
    assertion.matchedGuard,
    assertion.description,
  ].filter((value): value is string => Boolean(value?.trim()));
  return needles.some((needle) =>
    texts.some((text) => textOverlapsRepSource(needle, text)),
  );
}

export function classifyClaimOrigin(
  assertion: {
    description?: string | null;
    matchedGuard?: string | null;
    bodyExcerpt?: string | null;
  },
  sources: RepClaimSources,
  evidenceTexts: string[],
  consultationSources: ConsultationClaimSource[] = [],
): ClaimOrigin {
  if (isTraceableToRepInput(assertion, sources)) return "REP_ASSERTED";
  if (isTraceableToConsultationAnswer(assertion, consultationSources)) {
    return "CONSULTATION_ANSWER";
  }
  if (isTraceableToEvidence(assertion, evidenceTexts)) {
    return "EVIDENCE_SUPPORTED";
  }
  return "MODEL_ORIGINATED";
}

/** Keep only model inventions; rep and evidence-backed claims stay silent. */
export function keepModelOriginatedViolations(
  violations: ClaimValidationViolation[],
  sources: RepClaimSources,
  evidenceTexts: string[],
  consultationSources: ConsultationClaimSource[] = [],
): ClaimValidationViolation[] {
  return violations
    .filter(
      (violation) =>
        classifyClaimOrigin(
          violation,
          sources,
          evidenceTexts,
          consultationSources,
        ) === "MODEL_ORIGINATED",
    )
    .map((violation) => ({
      ...violation,
      origin: "MODEL_ORIGINATED" as const,
    }));
}

/**
 * Deterministic product restriction hits in the body — only when the phrase
 * is not already present in rep-owned input (offer / guidance / edits).
 */
export function deterministicClaimViolations(input: {
  body: string;
  claimsNotToMake: string[];
  terminologyToAvoid: string[];
  repSources: RepClaimSources;
}): ClaimValidationViolation[] {
  const bodyNormalized = normalizedClaimText(input.body);
  const repNormalized = normalizedClaimText(combinedRepSourceText(input.repSources));
  const violations: ClaimValidationViolation[] = [];

  for (const claim of input.claimsNotToMake) {
    const claimNormalized = normalizedClaimText(claim);
    if (
      claim &&
      bodyNormalized.includes(claimNormalized) &&
      !repNormalized.includes(claimNormalized)
    ) {
      violations.push({
        type: "PROHIBITED_CLAIM",
        description: `Generated copy repeats a prohibited claim: ${claim}`,
        matchedGuard: claim,
        bodyExcerpt: claim,
        origin: "MODEL_ORIGINATED",
      });
    }
  }
  for (const term of input.terminologyToAvoid) {
    const termNormalized = normalizedClaimText(term);
    if (
      term &&
      bodyNormalized.includes(termNormalized) &&
      !repNormalized.includes(termNormalized)
    ) {
      violations.push({
        type: "PROHIBITED_TERM",
        description: `Generated copy uses prohibited terminology: ${term}`,
        matchedGuard: term,
        bodyExcerpt: term,
        origin: "MODEL_ORIGINATED",
      });
    }
  }

  return violations;
}
