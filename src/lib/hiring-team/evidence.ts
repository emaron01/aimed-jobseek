import type { EvidenceExcerpt } from "@/lib/product-research/prompt";
import type { JobScorecard } from "@/lib/job-requirement/types";

export type HiringTeamJobEvidence = {
  title: string | null;
  companyName: string | null;
  location: string | null;
  workArrangement: string | null;
  employmentType: string | null;
  seniority: string | null;
  reportingLine: string | null;
  responsibilities: string[];
  requiredItems: string[];
  preferredItems: string[];
  scorecard: JobScorecard;
};

export type HiringTeamResearchEvidence = {
  companySummary: string | null;
  whatTheySell: string | null;
  businessModel: string | null;
  hiringSignals: string[];
  riskSignals: string[];
};

const JOB_REQUIREMENT_SOURCE_ID = "job-requirement";
const COMPANY_RESEARCH_SOURCE_ID = "company-research";

function lines(label: string, values: string[]): string[] {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  if (cleaned.length === 0) return [];
  return [`${label}:`, ...cleaned.map((value) => `- ${value}`)];
}

export function jobRequirementEvidenceText(job: HiringTeamJobEvidence): string {
  const scorecardLines = [
    job.scorecard.mission?.text
      ? `Mission: ${job.scorecard.mission.text}`
      : "",
    ...lines(
      "Scorecard outcomes",
      job.scorecard.outcomes.map((item) => item.text),
    ),
    ...lines(
      "Scorecard competencies",
      job.scorecard.competencies.map((item) => item.text),
    ),
  ].filter(Boolean);
  return [
    job.title ? `Title: ${job.title}` : "",
    job.companyName ? `Employer: ${job.companyName}` : "",
    job.location ? `Location: ${job.location}` : "",
    job.workArrangement ? `Work arrangement: ${job.workArrangement}` : "",
    job.employmentType ? `Employment type: ${job.employmentType}` : "",
    job.seniority ? `Seniority: ${job.seniority}` : "",
    job.reportingLine ? `Reports to: ${job.reportingLine}` : "",
    ...lines("Responsibilities", job.responsibilities),
    ...lines("Requirements", job.requiredItems),
    ...lines("Preferred", job.preferredItems),
    ...scorecardLines,
  ]
    .filter(Boolean)
    .join("\n");
}

export function companyResearchEvidenceText(
  research: HiringTeamResearchEvidence,
): string {
  return [
    research.companySummary ? `Summary: ${research.companySummary}` : "",
    research.whatTheySell ? `What they do: ${research.whatTheySell}` : "",
    research.businessModel ? `Business model: ${research.businessModel}` : "",
    ...lines("Hiring and growth", research.hiringSignals),
    ...lines("Employer risk", research.riskSignals),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Undisclosed employers and missing research contribute the job requirement only.
 */
export function hiringTeamEvidenceExcerpts(input: {
  job: HiringTeamJobEvidence;
  research: HiringTeamResearchEvidence | null;
  includeResearch: boolean;
}): EvidenceExcerpt[] {
  const excerpts: EvidenceExcerpt[] = [
    {
      sourceId: JOB_REQUIREMENT_SOURCE_ID,
      sourceType: "JOB_REQUIREMENT",
      displayName: "Job requirement",
      text: jobRequirementEvidenceText(input.job),
    },
  ];
  if (!input.includeResearch || !input.research) return excerpts;
  const researchText = companyResearchEvidenceText(input.research);
  if (!researchText.trim()) return excerpts;
  excerpts.push({
    sourceId: COMPANY_RESEARCH_SOURCE_ID,
    sourceType: "COMPANY_RESEARCH",
    displayName: "Company research",
    text: researchText,
  });
  return excerpts;
}

