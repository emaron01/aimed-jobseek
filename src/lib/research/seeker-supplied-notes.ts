import { applicationWorkspaceCopy } from "@/lib/product-config";
import type { RetrievedEvidenceBundle } from "@/lib/research/sources";
import type { ResearchSource } from "@/lib/research/types";

/** Reserved-TLD URL so seeker notes can be cited without being fetched. */
export const SEEKER_SUPPLIED_RESEARCH_SOURCE_URL =
  "https://notes.invalid/seeker-supplied-research";

export const COMPANY_RESEARCH_NOTES_MAX_CHARS = 20_000;
export const JOB_LEARNED_NOTES_MAX_CHARS = 20_000;

export function normalizeCompanyResearchNotes(
  value: string | null | undefined,
): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

export function normalizeJobLearnedNotes(
  value: string | null | undefined,
): string {
  return normalizeCompanyResearchNotes(value);
}

export function seekerSuppliedResearchSource(
  retrievedAt = new Date().toISOString(),
): ResearchSource {
  return {
    url: SEEKER_SUPPLIED_RESEARCH_SOURCE_URL,
    title: applicationWorkspaceCopy.companyNotesSourceTitle,
    publisher: null,
    sourceType: "OTHER",
    retrievedAt,
    supports: ["whatTheySell", "companySummary"],
  };
}

export function appendSeekerSuppliedResearchEvidence(
  evidence: RetrievedEvidenceBundle,
  notes: string | null | undefined,
): RetrievedEvidenceBundle {
  const text = normalizeCompanyResearchNotes(notes);
  if (!text) return evidence;
  if (
    evidence.sources.some(
      (source) => source.url === SEEKER_SUPPLIED_RESEARCH_SOURCE_URL,
    )
  ) {
    return evidence;
  }
  const source = seekerSuppliedResearchSource();
  return {
    sources: [...evidence.sources, source],
    excerpts: [
      ...evidence.excerpts,
      {
        url: source.url,
        title: source.title ?? applicationWorkspaceCopy.companyNotesSourceTitle,
        text,
      },
    ],
  };
}
