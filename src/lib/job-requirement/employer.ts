export type EmployerMatch = {
  id: string;
  name: string;
  identityAmbiguous: boolean;
};

export type EmployerResearchDecision =
  | {
      disposition: "UNDISCLOSED";
      reason: string;
      runResearch: false;
      scoreFit: false;
    }
  | {
      disposition: "AMBIGUOUS";
      reason: string;
      runResearch: false;
      scoreFit: false;
      matches: EmployerMatch[];
    }
  | {
      disposition: "IDENTIFIED";
      companyId: string | null;
      runResearch: true;
      scoreFit: true;
    };

const AGENCY_PATTERNS = [
  /\bstaffing (?:agency|firm)\b/i,
  /\brecruit(?:ing|ment) (?:agency|firm)\b/i,
  /\bexecutive search (?:firm|agency)\b/i,
  /\bon behalf of (?:our |a )?client\b/i,
  /\bour client is hiring\b/i,
];

const CONFIDENTIAL_PATTERNS = [
  /\bconfidential (?:employer|company|client|search|posting)\b/i,
  /\b(?:employer|company) (?:is |name )?(?:undisclosed|confidential|withheld)\b/i,
  /\bundisclosed employer\b/i,
  /\bcompany name (?:is )?(?:withheld|undisclosed|confidential)\b/i,
];

export function agencyEmployerReason(): string {
  return "This posting is from a staffing or recruiting agency. The employer is undisclosed, so employer research and fit are skipped until you name the employer.";
}

export function confidentialEmployerReason(): string {
  return "This posting does not disclose the employer. Employer research and fit are skipped until you supply the employer's name.";
}

export function ambiguousEmployerReason(): string {
  return "More than one company matches this name. Confirm the employer before research runs.";
}

export function identityAmbiguousReason(): string {
  return "Company research could not confirm this employer's identity. Confirm the company before fit is scored.";
}

export function classifyPostingEmployer(rawText: string): {
  kind: "agency" | "confidential" | null;
  reason: string | null;
} {
  const text = rawText ?? "";
  if (AGENCY_PATTERNS.some((pattern) => pattern.test(text))) {
    return { kind: "agency", reason: agencyEmployerReason() };
  }
  if (CONFIDENTIAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return { kind: "confidential", reason: confidentialEmployerReason() };
  }
  return { kind: null, reason: null };
}

/**
 * Agency and confidential postings never research the named party as the employer.
 * An ambiguous match waits for the seeker before research or fit.
 */
export function decideEmployerResearch(input: {
  rawText: string;
  matches: EmployerMatch[];
}): EmployerResearchDecision {
  const classified = classifyPostingEmployer(input.rawText);
  if (classified.kind) {
    return {
      disposition: "UNDISCLOSED",
      reason: classified.reason ?? confidentialEmployerReason(),
      runResearch: false,
      scoreFit: false,
    };
  }
  if (input.matches.length > 1) {
    return {
      disposition: "AMBIGUOUS",
      reason: ambiguousEmployerReason(),
      runResearch: false,
      scoreFit: false,
      matches: input.matches,
    };
  }
  const only = input.matches[0];
  if (only?.identityAmbiguous) {
    return {
      disposition: "AMBIGUOUS",
      reason: identityAmbiguousReason(),
      runResearch: false,
      scoreFit: false,
      matches: input.matches,
    };
  }
  return {
    disposition: "IDENTIFIED",
    companyId: only?.id ?? null,
    runResearch: true,
    scoreFit: true,
  };
}

export function decisionAfterResearchIdentity(identityAmbiguous: boolean): {
  disposition: "AMBIGUOUS" | "IDENTIFIED";
  scoreFit: boolean;
  reason: string | null;
} {
  if (identityAmbiguous) {
    return {
      disposition: "AMBIGUOUS",
      scoreFit: false,
      reason: identityAmbiguousReason(),
    };
  }
  return { disposition: "IDENTIFIED", scoreFit: true, reason: null };
}
