/**
 * Caching: company research paid-call fingerprint + subject key.
 * Receipt operation COMPANY_RESEARCH; subjectKey organizationId:companyId.
 */
import {
  findPaidCallReceipt,
  fingerprintPaidCallInputs,
  runPaidStructuredCall,
  type PaidCallOperation,
} from "@/lib/ai/paid-call-gate";
import { RESEARCH_PROMPT_VERSION } from "@/lib/research/config";
import { normalizeDomain } from "@/lib/research/normalize";
import {
  hasUsableCompanyResearchFields,
  type CompanyResearchContent,
} from "@/lib/research/freshness";
import type {
  CompanyResearchDepthPolicy,
  CompanyResearchResult,
} from "@/lib/research/types";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";

export const COMPANY_RESEARCH_OPERATION =
  "COMPANY_RESEARCH" as const satisfies PaidCallOperation;

export const COMPANY_RESEARCH_UNCHANGED_MESSAGE =
  "No Changes To Company Research";

export const COMPANY_RESEARCH_UNCHANGED_REASON = "unchanged";

const schemaName = structuredOutputRequest("companyResearch").schemaName;

export function companyResearchSubjectKey(
  organizationId: string,
  companyId: string,
): string {
  return `${organizationId}:${companyId}`;
}

/** One paid-call receipt per application, not per shared company. */
export function applicationResearchSubjectKey(
  organizationId: string,
  campaignId: string,
): string {
  return `${organizationId}:campaign:${campaignId}`;
}

/**
 * Reuse only when the anchor, posting, notes, and prompt version match.
 * Key order is part of the hash.
 */
export function applicationResearchFingerprint(input: {
  anchorHost: string;
  website: string | null;
  postingTitle: string | null;
  postingUrl: string | null;
  postingText: string | null;
  seekerSuppliedNotes?: string | null;
}): string {
  return fingerprintPaidCallInputs({
    promptVersion: RESEARCH_PROMPT_VERSION,
    schemaName,
    anchorHost: input.anchorHost.trim().toLowerCase(),
    website: input.website?.trim() || null,
    postingTitle: input.postingTitle?.trim() || null,
    postingUrl: input.postingUrl?.trim() || null,
    postingText: input.postingText?.trim() || null,
    seekerSuppliedNotes: input.seekerSuppliedNotes?.trim() || null,
  });
}

export function companyResearchFingerprint(input: {
  name: string;
  website: string | null;
  normalizedDomain: string | null;
  industry: string | null;
  employeeCount: number | null;
  location: string | null;
  seekerSuppliedNotes?: string | null;
  depthPolicy: CompanyResearchDepthPolicy;
  evidenceTargets?: string[] | null;
}): string {
  const website = input.website?.trim() || null;
  const normalizedDomain = input.normalizedDomain?.trim() || null;
  return fingerprintPaidCallInputs({
    promptVersion: RESEARCH_PROMPT_VERSION,
    schemaName,
    name: input.name.trim(),
    website,
    normalizedDomain,
    anchorHost: normalizedDomain?.toLowerCase() || normalizeDomain(website) || null,
    industry: input.industry?.trim() || null,
    employeeCount: input.employeeCount,
    location: input.location?.trim() || null,
    seekerSuppliedNotes: input.seekerSuppliedNotes?.trim() || null,
    depthPolicy: {
      maxSearchQueriesPerCompany: input.depthPolicy.maxSearchQueriesPerCompany,
      maxSourcesPerCompany: input.depthPolicy.maxSourcesPerCompany,
      researchFreshnessDays: input.depthPolicy.researchFreshnessDays,
    },
    evidenceTargets: input.evidenceTargets?.length
      ? [...input.evidenceTargets].map((row) => row.trim()).filter(Boolean).sort()
      : null,
  });
}

export function isUsableCompanyResearchResult(
  result: CompanyResearchContent | CompanyResearchResult | null | undefined,
): boolean {
  return hasUsableCompanyResearchFields(result);
}

/** True when a receipt exists for this fingerprint and current research is usable. */
export async function companyResearchFingerprintUnchanged(input: {
  organizationId: string;
  companyId: string;
  fingerprint: string;
  research: CompanyResearchContent | null | undefined;
}): Promise<boolean> {
  if (!isUsableCompanyResearchResult(input.research)) return false;
  const receipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: COMPANY_RESEARCH_OPERATION,
    subjectKey: companyResearchSubjectKey(input.organizationId, input.companyId),
  });
  return Boolean(receipt && receipt.inputHash === input.fingerprint);
}

/**
 * Run the research provider under the Phase 1 gate.
 * Receipt is written only when the provider result is usable.
 * Concurrent callers for the same subjectKey serialize via gate in-flight protection.
 */
export async function runGatedCompanyResearch(input: {
  organizationId: string;
  companyId: string;
  fingerprint: string;
  subjectKey?: string;
  callProvider: () => Promise<CompanyResearchResult>;
}): Promise<{ data: CompanyResearchResult; skipped: boolean }> {
  return runPaidStructuredCall({
    organizationId: input.organizationId,
    operation: COMPANY_RESEARCH_OPERATION,
    subjectKey:
      input.subjectKey ??
      companyResearchSubjectKey(input.organizationId, input.companyId),
    inputFingerprint: input.fingerprint,
    parseStored: (json) => json as CompanyResearchResult,
    isResultUsable: isUsableCompanyResearchResult,
    callProvider: input.callProvider,
  });
}
