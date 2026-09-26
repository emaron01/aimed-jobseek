import type { ResearchSource } from "@/lib/research/types";

export const COMPANY_RESEARCH_FIELD_KEYS = [
  "companySummary",
  "whatTheySell",
  "customerTypes",
  "primaryMarkets",
  "businessModel",
  "estimatedAov",
  "aovReasoning",
  "companySizeContext",
  "relevantTechnologies",
  "buyingSignals",
  "hiringSignals",
  "riskSignals",
] as const;

export type CompanyResearchFieldKey =
  (typeof COMPANY_RESEARCH_FIELD_KEYS)[number];

export const COMPANY_RESEARCH_FIELD_LABELS: Record<
  CompanyResearchFieldKey,
  string
> = {
  companySummary: "Company summary",
  whatTheySell: "What they make or do",
  customerTypes: "Customer types",
  primaryMarkets: "Primary markets",
  businessModel: "Business model",
  estimatedAov: "Estimated deal size",
  aovReasoning: "Deal size reasoning",
  companySizeContext: "Company size",
  relevantTechnologies: "Technologies",
  buyingSignals: "Hiring and growth signals",
  hiringSignals: "Hiring and growth",
  riskSignals: "Risk signals",
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sourceLabel(source: ResearchSource): string {
  if (source.title?.trim()) return source.title.trim();
  if (source.publisher?.trim()) return source.publisher.trim();
  try {
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    return source.url;
  }
}

export function sourceSupportsField(
  source: ResearchSource,
  fieldKey: string,
): boolean {
  const field = normalize(fieldKey);
  const label = normalize(
    COMPANY_RESEARCH_FIELD_LABELS[fieldKey as CompanyResearchFieldKey] ?? fieldKey,
  );
  return source.supports.some((support) => {
    const value = normalize(support);
    if (!value) return false;
    return (
      value === field ||
      value === label ||
      value.includes(field) ||
      field.includes(value) ||
      (label.length > 0 && (value.includes(label) || label.includes(value)))
    );
  });
}

export function sourcesSupportingField(
  sources: ResearchSource[],
  fieldKey: string,
): ResearchSource[] {
  return sources.filter((source) => sourceSupportsField(source, fieldKey));
}

export function sourcesSupportingClaim(
  sources: ResearchSource[],
  claim: string,
  fieldKey?: string,
): ResearchSource[] {
  const needle = normalize(claim);
  const matched = new Map<string, ResearchSource>();

  for (const source of sources) {
    if (fieldKey && sourceSupportsField(source, fieldKey)) {
      matched.set(source.url, source);
    }
    for (const support of source.supports) {
      const value = normalize(support);
      if (!needle || !value) continue;
      if (value === needle || value.includes(needle) || needle.includes(value)) {
        matched.set(source.url, source);
      }
    }
  }

  return [...matched.values()];
}

export function describeCompanySourceLead(input: {
  sources: ResearchSource[];
  researchMethod: string | null | undefined;
}): { sentence: string; names: string[] } {
  const sources = input.sources;
  if (sources.length === 0) {
    if (input.researchMethod === "MANUAL") {
      return {
        sentence: "This briefing was entered manually.",
        names: [],
      };
    }
    if (input.researchMethod === "HYBRID") {
      return {
        sentence:
          "This briefing combines automated research with manual corrections.",
        names: [],
      };
    }
    return {
      sentence: "No web sources were recorded for this company yet.",
      names: [],
    };
  }

  const websiteCount = sources.filter(
    (s) => s.sourceType === "COMPANY_WEBSITE",
  ).length;
  const otherCount = sources.length - websiteCount;
  const parts: string[] = [];
  if (websiteCount > 0) {
    parts.push(
      `${websiteCount} company website page${websiteCount === 1 ? "" : "s"}`,
    );
  }
  if (otherCount > 0) {
    parts.push(`${otherCount} other source${otherCount === 1 ? "" : "s"}`);
  }

  const methodNote =
    input.researchMethod === "HYBRID"
      ? " Includes manual corrections."
      : input.researchMethod === "MANUAL"
        ? " Recorded manually."
        : "";

  return {
    sentence: `We read ${sources.length} source${sources.length === 1 ? "" : "s"} — ${parts.join(" and ")}.${methodNote}`,
    names: sources.map(sourceLabel),
  };
}

export function formatCompanyBriefingMeta(input: {
  domain: string | null;
  employeeCount: string | null;
  revenue: string | null;
  lastResearched: string | null;
  industry: string | null;
  location: string | null;
}): string {
  return [
    input.domain,
    input.industry,
    input.location,
    input.employeeCount ? `${input.employeeCount} employees` : null,
    input.revenue ? `Revenue ${input.revenue}` : null,
    input.lastResearched ? `Last researched ${input.lastResearched}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function sourceLabelForCompany(source: ResearchSource): string {
  return sourceLabel(source);
}
