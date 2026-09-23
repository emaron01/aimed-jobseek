/**
 * Product review helpers: source lead-in, form parse for every productDraft
 * field, and evidence-chip matching. Domain-agnostic.
 */

import type { ProductDraft } from "@/lib/product-research/contract";
import { PRODUCT_URL_UNREADABLE_MESSAGE } from "@/lib/product-research/extraction-quality";
import { vocab } from "@/lib/product-config";

export type ProductReviewSource = {
  id: string;
  sourceType: string;
  displayName: string;
  originalUrl?: string | null;
  filename?: string | null;
  status?: string | null;
  errorSafe?: string | null;
  extractedCharCount?: number | null;
};

export type ProductDraftEvidenceRef = {
  claim: string;
  sourceIds: string[];
  note?: string | null;
};

export const PRODUCT_DRAFT_STRING_FIELDS = [
  "description",
  "valueProposition",
  "pricingAovContext",
  "deploymentContext",
] as const;

export const PRODUCT_DRAFT_LIST_FIELDS = [
  "problemsSolved",
  "capabilities",
  "differentiators",
  "primaryUseCases",
  "relevantBuyerFunctions",
  "relevantIndustries",
  "businessOutcomes",
  "proofPoints",
  "customerEvidence",
  "terminology",
  "unknownFields",
] as const;

export type ProductDraftStringField =
  (typeof PRODUCT_DRAFT_STRING_FIELDS)[number];
export type ProductDraftListField = (typeof PRODUCT_DRAFT_LIST_FIELDS)[number];

/** Fields the review form used to render — everything else was invisible. */
export const PREVIOUSLY_RENDERED_DRAFT_FIELDS = [
  "description",
  "valueProposition",
  "unknownFields",
  "evidenceRefs",
] as const;

export const PREVIOUSLY_DROPPED_FROM_FORM: Array<
  ProductDraftStringField | ProductDraftListField
> = [
  "problemsSolved",
  "capabilities",
  "differentiators",
  "primaryUseCases",
  "relevantBuyerFunctions",
  "relevantIndustries",
  "businessOutcomes",
  "pricingAovContext",
  "deploymentContext",
  "proofPoints",
  "customerEvidence",
  "terminology",
];

export const PRODUCT_DRAFT_FIELD_HINTS: Record<
  ProductDraftStringField | ProductDraftListField | "evidenceRefs" | "name" | "websiteUrl",
  string
> = {
  name: "The product name as you want it used in emails and scoring.",
  websiteUrl: "Primary product or company URL.",
  description: `What this ${vocab.product.singular} is, in plain language.`,
  valueProposition: "The core value a buyer gets.",
  problemsSolved: "One problem per line.",
  capabilities: "One capability per line.",
  differentiators: "One differentiator per line.",
  primaryUseCases: "One use case per line.",
  relevantBuyerFunctions: "One buyer function or role family per line.",
  relevantIndustries: "One industry or market per line.",
  businessOutcomes: "One outcome per line.",
  pricingAovContext: "How it is priced or typical deal size, if known.",
  deploymentContext: "How it is sold or deployed (sales motion, delivery).",
  proofPoints: "One proof point per line.",
  customerEvidence: "One customer or case reference per line.",
  terminology: "One term per line, including product-coined language.",
  unknownFields:
    "Field names with no supporting evidence. One name per line. Do not invent values for these.",
  evidenceRefs: "Supporting claims tied to sources. One claim per row.",
};

export const PRODUCT_DRAFT_FIELD_LABELS: Record<
  string,
  string
> = {
  description: "Description",
  valueProposition: "Value proposition",
  problemsSolved: "Problems it solves",
  capabilities: "Capabilities",
  differentiators: "Differentiators",
  primaryUseCases: "Use cases",
  relevantBuyerFunctions: "Buyer functions",
  relevantIndustries: "Industries",
  businessOutcomes: "Business outcomes",
  pricingAovContext: "Pricing / deal context",
  deploymentContext: "How it is sold",
  proofPoints: "Proof points",
  customerEvidence: "Customer evidence",
  terminology: "Language",
  unknownFields: "Unknown fields",
  evidenceRefs: "Evidence",
};

export function parseNewlineList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function emptyProductDraft(): ProductDraft {
  return {
    description: null,
    valueProposition: null,
    problemsSolved: [],
    capabilities: [],
    differentiators: [],
    primaryUseCases: [],
    relevantBuyerFunctions: [],
    relevantIndustries: [],
    businessOutcomes: [],
    pricingAovContext: null,
    deploymentContext: null,
    proofPoints: [],
    customerEvidence: [],
    terminology: [],
    unknownFields: [],
    evidenceRefs: [],
  };
}

function optionalFormString(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

function parseEvidenceRefsJson(raw: string): ProductDraft["evidenceRefs"] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const rec = row as Record<string, unknown>;
        const claim = String(rec.claim ?? "").trim();
        if (!claim) return null;
        const sourceIds = Array.isArray(rec.sourceIds)
          ? rec.sourceIds.map(String).map((id) => id.trim()).filter(Boolean)
          : String(rec.sourceIds ?? "")
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean);
        const noteRaw = rec.note;
        const note =
          noteRaw == null || String(noteRaw).trim() === ""
            ? null
            : String(noteRaw).trim();
        return { claim, sourceIds, note };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  } catch {
    return [];
  }
}

/**
 * Read every productDraftJson field from the review form.
 * List fields are newline-separated. evidenceRefs is JSON.
 */
export function productDraftFromFormData(formData: FormData): ProductDraft {
  const draft: ProductDraft = {
    description: optionalFormString(formData, "description"),
    valueProposition: optionalFormString(formData, "valueProposition"),
    problemsSolved: parseNewlineList(String(formData.get("problemsSolved") ?? "")),
    capabilities: parseNewlineList(String(formData.get("capabilities") ?? "")),
    differentiators: parseNewlineList(
      String(formData.get("differentiators") ?? ""),
    ),
    primaryUseCases: parseNewlineList(
      String(formData.get("primaryUseCases") ?? ""),
    ),
    relevantBuyerFunctions: parseNewlineList(
      String(formData.get("relevantBuyerFunctions") ?? ""),
    ),
    relevantIndustries: parseNewlineList(
      String(formData.get("relevantIndustries") ?? ""),
    ),
    businessOutcomes: parseNewlineList(
      String(formData.get("businessOutcomes") ?? ""),
    ),
    pricingAovContext: optionalFormString(formData, "pricingAovContext"),
    deploymentContext: optionalFormString(formData, "deploymentContext"),
    proofPoints: parseNewlineList(String(formData.get("proofPoints") ?? "")),
    customerEvidence: parseNewlineList(
      String(formData.get("customerEvidence") ?? ""),
    ),
    terminology: parseNewlineList(String(formData.get("terminology") ?? "")),
    unknownFields: parseNewlineList(String(formData.get("unknownFields") ?? "")),
    evidenceRefs: parseEvidenceRefsJson(
      String(formData.get("evidenceRefsJson") ?? ""),
    ),
  };
  return reconcileUnknownFields(draft);
}

function fieldHasContent(
  draft: ProductDraft,
  key: string,
): boolean {
  if (key === "evidenceRefs") return (draft.evidenceRefs?.length ?? 0) > 0;
  const value = draft[key as keyof ProductDraft];
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

/** Drop unknown markers once the matching field has content. */
export function reconcileUnknownFields(draft: ProductDraft): ProductDraft {
  const unknownFields = (draft.unknownFields ?? []).filter(
    (key) => key.trim() && !fieldHasContent(draft, key.trim()),
  );
  return { ...draft, unknownFields };
}

export function stringifyDraftList(values: string[] | undefined): string {
  return (values ?? []).join("\n");
}

function listsEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

export function diffProductDraftFields(
  original: ProductDraft | null,
  next: ProductDraft,
): string[] {
  const baseline = original ?? emptyProductDraft();
  const edited: string[] = [];
  for (const key of PRODUCT_DRAFT_STRING_FIELDS) {
    if ((baseline[key] ?? null) !== (next[key] ?? null)) edited.push(key);
  }
  for (const key of PRODUCT_DRAFT_LIST_FIELDS) {
    if (!listsEqual(baseline[key], next[key])) edited.push(key);
  }
  const baselineRefs = JSON.stringify(baseline.evidenceRefs ?? []);
  const nextRefs = JSON.stringify(next.evidenceRefs ?? []);
  if (baselineRefs !== nextRefs) edited.push("evidenceRefs");
  return edited;
}

function joinReadable(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function countPhrase(
  count: number,
  one: string,
  many: (n: number) => string,
): string | null {
  if (count <= 0) return null;
  if (count === 1) return one;
  return many(count);
}

export function describeReadSources(sources: ProductReviewSource[]): {
  sentence: string;
  names: string[];
} {
  const usable = sources.filter(
    (source) =>
      source.status !== "FAILED" &&
      source.sourceType !== "FAILED_URL",
  );
  const names = usable.map((source) => {
    if (source.sourceType === "URL" || source.sourceType === "WEB_SEARCH") {
      return source.displayName || source.originalUrl || "Website";
    }
    if (source.sourceType === "UPLOADED_DOCUMENT") {
      return source.filename || source.displayName || "Uploaded document";
    }
    return source.displayName;
  });

  const urls = usable.filter(
    (s) => s.sourceType === "URL" || s.sourceType === "WEB_SEARCH",
  ).length;
  const uploads = usable.filter((s) => s.sourceType === "UPLOADED_DOCUMENT").length;
  const notes = usable.filter((s) => s.sourceType === "USER_NOTE").length;
  const pastes = usable.filter((s) => s.sourceType === "PASTED_TEXT").length;

  const parts = [
    countPhrase(urls, "your website", (n) => `${n} pages from your website`),
    countPhrase(
      uploads,
      "1 uploaded document",
      (n) => `${n} uploaded documents`,
    ),
    countPhrase(notes, "your notes", (n) => `${n} notes`),
    countPhrase(pastes, "pasted content", (n) => `${n} pasted excerpts`),
  ].filter((part): part is string => Boolean(part));

  const sentence =
    parts.length === 0
      ? "We read the material you provided."
      : `We read ${joinReadable(parts)}.`;

  return { sentence, names };
}

const CORE_LIST_FIELDS = [
  "problemsSolved",
  "capabilities",
  "differentiators",
  "primaryUseCases",
  "businessOutcomes",
  "proofPoints",
] as const;

/**
 * Near-empty synthesis (title restatement + everything unknown) is a failed
 * read, not a completed product profile.
 */
export function isNearEmptyProductDraft(draft: ProductDraft | null | undefined): boolean {
  if (!draft) return true;
  const emptyLists = CORE_LIST_FIELDS.filter((key) => {
    const value = draft[key];
    return !Array.isArray(value) || value.length === 0;
  }).length;
  const unknownCount = draft.unknownFields?.length ?? 0;
  const description = (draft.description ?? "").trim();
  const descriptionThin = description.length < 80;
  return (
    (emptyLists >= 5 && unknownCount >= 5) ||
    (emptyLists >= 4 && unknownCount >= 6 && descriptionThin)
  );
}

export type ProductSourceLead = {
  kind: "read_ok" | "failed_read";
  sentence: string;
  detail: string | null;
  names: string[];
  failedUrls: Array<{ url: string; extractedCharCount: number | null; errorSafe: string | null }>;
};

/**
 * Lead copy for the research review. Failed/empty URL reads must not claim
 * "We read your website."
 */
export function describeProductSourceLead(input: {
  sources: ProductReviewSource[];
  draft?: ProductDraft | null;
}): ProductSourceLead {
  const failedUrls = input.sources
    .filter(
      (source) =>
        source.sourceType === "URL" &&
        (source.status === "FAILED" || Boolean(source.errorSafe)),
    )
    .map((source) => ({
      url: source.originalUrl || source.displayName || "the product URL",
      extractedCharCount: source.extractedCharCount ?? null,
      errorSafe: source.errorSafe ?? null,
    }));

  const acquired = input.sources.filter(
    (source) =>
      source.status !== "FAILED" &&
      !(source.sourceType === "URL" && source.errorSafe),
  );
  const nearEmpty = isNearEmptyProductDraft(input.draft ?? null);

  if (failedUrls.length > 0 && (acquired.length === 0 || nearEmpty)) {
    const first = failedUrls[0];
    const extracted =
      first.extractedCharCount != null
        ? ` Extracted ${first.extractedCharCount} characters from ${first.url}.`
        : ` From ${first.url}.`;
    return {
      kind: "failed_read",
      sentence: PRODUCT_URL_UNREADABLE_MESSAGE,
      detail: `${extracted} Paste the ${vocab.product.singular} description into the paste field and try again.`,
      names: [],
      failedUrls,
    };
  }

  if (nearEmpty) {
    return {
      kind: "failed_read",
      sentence:
        "We could not build a usable product profile from the material available.",
      detail:
        `Almost every field was unknown. Paste the ${vocab.product.singular} description into the paste field and try again.`,
      names: describeReadSources(acquired).names,
      failedUrls,
    };
  }

  const ok = describeReadSources(acquired);
  return {
    kind: "read_ok",
    sentence: ok.sentence,
    detail: null,
    names: ok.names,
    failedUrls,
  };
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function evidenceRefsForText(
  text: string,
  refs: ProductDraftEvidenceRef[],
): ProductDraftEvidenceRef[] {
  const needle = normalizeForMatch(text);
  if (!needle) return [];
  return refs.filter((ref) => {
    const claim = normalizeForMatch(ref.claim);
    if (!claim) return false;
    if (claim === needle) return true;
    if (claim.includes(needle) || needle.includes(claim)) return true;
    const claimTokens = new Set(claim.split(" ").filter((t) => t.length > 2));
    const textTokens = needle.split(" ").filter((t) => t.length > 2);
    if (textTokens.length === 0 || claimTokens.size === 0) return false;
    const overlap = textTokens.filter((token) => claimTokens.has(token)).length;
    return overlap / Math.min(textTokens.length, claimTokens.size) >= 0.6;
  });
}

export function sourceLabelForId(
  sourceId: string,
  sources: ProductReviewSource[],
): string {
  const match = sources.find((source) => source.id === sourceId);
  if (!match) return "Source";
  if (match.sourceType === "UPLOADED_DOCUMENT") {
    return match.filename || match.displayName;
  }
  return match.displayName;
}
