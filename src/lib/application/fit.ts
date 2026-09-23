import { isLimitedPublicEvidenceClass } from "@/lib/criteria/evidence-class";
import { resolveCompanyActualWithProvenance } from "@/lib/criteria/research-cascade";
import type { CompanyListActuals, CompanyResearchActuals } from "@/lib/criteria/research-cascade";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import { evaluateIcpCriterionWithEvidenceClass } from "@/lib/criteria/targeted-search-eval";
import {
  icpQualificationToBucket,
  resolveIcpQualification,
} from "@/lib/scoring/icp-qualification";
import {
  compareEmployerCompensation,
  compensationSignalMiss,
  type EmployerCompensationProfile,
} from "@/lib/application/compensation-fit";
import { criterionFlags, vocab } from "@/lib/product-config";
import type { QualificationBucket } from "@prisma/client";

export type ApplicationFitOutcome = {
  criterionId: string | null;
  name: string;
  evidenceClass: string;
  isRequired: boolean;
  isDisqualifier: boolean;
  assessment: string;
  evidenceOutcome: string | null;
  reasoning: string;
  evidence: string | null;
  source: string | null;
  limitedPublicEvidence: boolean;
  mustHaveMiss: boolean;
  dealBreakerHit: boolean;
  preferenceMiss?: boolean;
  estimated?: boolean;
};

export type ApplicationFitComputation = {
  bucket: QualificationBucket;
  outcomes: ApplicationFitOutcome[];
  interpretationPromptVersion: string | null;
  /** Employer fit never gates contacts, assets, or interviews. */
  blocksDownstream: false;
};

function confirmedMiss(assessment: string, evidenceOutcome: string | null): boolean {
  return assessment === "NO_FIT" || evidenceOutcome === "CONTRADICTED";
}

export function computeApplicationEmployerFit(input: {
  criteria: CriterionSnapshot[];
  company: CompanyListActuals;
  research: CompanyResearchActuals | null;
  interpretationPromptVersion: string | null;
  compensation?: {
    profile: EmployerCompensationProfile;
    compensationRange: string | null;
    employmentType: string | null;
  };
}): ApplicationFitComputation {
  const assessments = input.criteria.map((criterion) => {
    const resolution = resolveCompanyActualWithProvenance(
      criterion,
      input.company,
      input.research,
    );
    const assessment = evaluateIcpCriterionWithEvidenceClass({
      criterion,
      actualValue: resolution.value,
      provenance: resolution.provenance,
    });
    return { criterion, resolution, assessment };
  });

  const qualification = resolveIcpQualification({
    criteria: input.criteria,
    assessments: assessments.map((row) => row.assessment),
  });
  let bucket = icpQualificationToBucket(qualification, null);

  const outcomes: ApplicationFitOutcome[] = assessments.map(
    ({ criterion, resolution, assessment }) => {
      const evidenceClass = assessment.evidenceClass;
      const miss = confirmedMiss(
        assessment.assessment,
        assessment.evidenceOutcome ?? null,
      );
      return {
        criterionId: criterion.id ?? null,
        name: criterion.name,
        evidenceClass,
        isRequired: criterion.isRequired,
        isDisqualifier: criterion.isDisqualifier,
        assessment: assessment.assessment,
        evidenceOutcome: assessment.evidenceOutcome ?? null,
        reasoning: assessment.reasoning,
        evidence: resolution.provenance?.excerpt ?? resolution.provenance?.displayValue ?? null,
        source: resolution.provenance?.label ?? null,
        limitedPublicEvidence: isLimitedPublicEvidenceClass(evidenceClass),
        mustHaveMiss: criterion.isRequired && miss,
        dealBreakerHit: criterion.isDisqualifier && miss,
      };
    },
  );

  if (input.compensation) {
    const payOutcomes = compareEmployerCompensation(input.compensation);
    outcomes.push(...payOutcomes);
    if (compensationSignalMiss(payOutcomes) && bucket === "GOOD") {
      bucket = "NEEDS_REVIEW";
    }
  }

  return {
    bucket,
    outcomes,
    interpretationPromptVersion: input.interpretationPromptVersion,
    blocksDownstream: false,
  };
}

export type StoredApplicationFit = {
  bucket: QualificationBucket;
  overrideBucket: QualificationBucket | null;
  overrideReason: string | null;
  overriddenAt: Date | null;
  stale: boolean;
  staleReason: string | null;
  computedAt: Date;
  icpUpdatedAt: Date;
  companyResearchUpdatedAt: Date | null;
  interpretationPromptVersion: string | null;
};

export function displayedFitBucket(fit: {
  bucket: QualificationBucket;
  overrideBucket: QualificationBucket | null;
}): QualificationBucket {
  return fit.overrideBucket ?? fit.bucket;
}

export function researchRefreshStaleReason(): string {
  return "Company research was refreshed. Rescore employer fit.";
}

export function targetEmployerStaleReason(): string {
  return `${vocab.icp.Singular} changed. Rescore employer fit.`;
}

export function applicationFitStaleReason(input: {
  computedAt: Date;
  recordedIcpUpdatedAt: Date;
  recordedResearchUpdatedAt: Date | null;
  recordedPromptVersion: string | null;
  currentIcpUpdatedAt: Date;
  currentResearchUpdatedAt: Date | null;
  currentPromptVersion: string | null;
}): string | null {
  if (
    input.currentResearchUpdatedAt &&
    (!input.recordedResearchUpdatedAt ||
      input.currentResearchUpdatedAt.getTime() >
        input.recordedResearchUpdatedAt.getTime())
  ) {
    return researchRefreshStaleReason();
  }
  if (
    input.currentIcpUpdatedAt.getTime() > input.recordedIcpUpdatedAt.getTime() ||
    (input.currentPromptVersion ?? null) !== (input.recordedPromptVersion ?? null)
  ) {
    return targetEmployerStaleReason();
  }
  return null;
}

export function applyFitOverride<T extends StoredApplicationFit>(
  fit: T,
  override: {
    bucket: QualificationBucket;
    reason: string;
    at: Date;
  },
): T {
  const reason = override.reason.trim();
  if (!reason) {
    throw new Error("An override needs a reason.");
  }
  return {
    ...fit,
    overrideBucket: override.bucket,
    overrideReason: reason,
    overriddenAt: override.at,
  };
}

export function fitSignalLabels(outcome: {
  mustHaveMiss: boolean;
  dealBreakerHit: boolean;
  limitedPublicEvidence: boolean;
}): string[] {
  const labels: string[] = [];
  if (outcome.mustHaveMiss) labels.push(criterionFlags.required);
  if (outcome.dealBreakerHit) labels.push(criterionFlags.disqualifier);
  if (outcome.limitedPublicEvidence) labels.push(criterionFlags.limitedPublicEvidence);
  return labels;
}
