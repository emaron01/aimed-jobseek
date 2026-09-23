import type { ProductDraft } from "@/lib/product-research/contract";
import {
  PRODUCT_DRAFT_FIELD_LABELS,
  PRODUCT_DRAFT_LIST_FIELDS,
  PRODUCT_DRAFT_STRING_FIELDS,
  diffProductDraftFields,
  emptyProductDraft,
  stringifyDraftList,
} from "@/lib/product-research/review";
import { vocab } from "@/lib/product-config";

export type ProductResynthesisApplyPlanItem = {
  label: string;
  detail?: string;
};

export type ProductResynthesisFieldDiff = {
  field: string;
  label: string;
  before: string;
  after: string;
};

export type ProductResynthesisApplyPlan = {
  preserved: ProductResynthesisApplyPlanItem[];
  replaced: ProductResynthesisApplyPlanItem[];
  fieldDiffs: ProductResynthesisFieldDiff[];
};

function asManualFieldList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function fieldTextValue(draft: ProductDraft, field: string): string {
  if ((PRODUCT_DRAFT_STRING_FIELDS as readonly string[]).includes(field)) {
    const key = field as (typeof PRODUCT_DRAFT_STRING_FIELDS)[number];
    return (draft[key] ?? "").trim();
  }
  if ((PRODUCT_DRAFT_LIST_FIELDS as readonly string[]).includes(field)) {
    const key = field as (typeof PRODUCT_DRAFT_LIST_FIELDS)[number];
    return stringifyDraftList(draft[key]);
  }
  if (field === "evidenceRefs") {
    return JSON.stringify(draft.evidenceRefs ?? [], null, 2);
  }
  return "";
}

export function productDraftFromApprovedProfile(
  profileJson: unknown,
): ProductDraft {
  if (!profileJson || typeof profileJson !== "object") {
    return emptyProductDraft();
  }
  return { ...emptyProductDraft(), ...(profileJson as ProductDraft) };
}

export function buildProductResynthesisApplyPlan(input: {
  product: {
    id: string;
    name: string;
    manuallyEditedFields: unknown;
  };
  before: ProductDraft;
  after: ProductDraft;
}): ProductResynthesisApplyPlan {
  const preserved: ProductResynthesisApplyPlanItem[] = [
    {
      label: `${vocab.product.Singular} id`,
      detail: `${input.product.id} — ${vocab.campaign.plural}, ${vocab.icp.plural}, ${vocab.persona.plural}, and scoring runs stay linked.`,
    },
    {
      label: `${vocab.product.Singular} name`,
      detail: input.product.name,
    },
  ];

  const manualFields = asManualFieldList(input.product.manuallyEditedFields);
  for (const field of manualFields) {
    const value = fieldTextValue(input.before, field);
    preserved.push({
      label: PRODUCT_DRAFT_FIELD_LABELS[field] ?? field,
      detail: value.trim() || "(empty)",
    });
  }

  const replaced: ProductResynthesisApplyPlanItem[] = [];
  const fieldDiffs: ProductResynthesisFieldDiff[] = [];
  const changedFields = diffProductDraftFields(input.before, input.after);

  for (const field of changedFields) {
    if (manualFields.includes(field)) continue;
    const before = fieldTextValue(input.before, field);
    const after = fieldTextValue(input.after, field);
    fieldDiffs.push({
      field,
      label: PRODUCT_DRAFT_FIELD_LABELS[field] ?? field,
      before,
      after,
    });
    replaced.push({
      label: PRODUCT_DRAFT_FIELD_LABELS[field] ?? field,
    });
  }

  if (replaced.length > 0) {
    replaced.push({
      label: `Stored ${vocab.product.singular} messaging`,
      detail: "messagingJson from the synthesis draft",
    });
  }

  return { preserved, replaced, fieldDiffs };
}

export function mergeProtectedProductDraftFields(input: {
  current: ProductDraft;
  proposed: ProductDraft;
  manuallyEditedFields: unknown;
}): ProductDraft {
  const manualFields = asManualFieldList(input.manuallyEditedFields);
  const merged: ProductDraft = { ...input.proposed };

  for (const field of manualFields) {
    if ((PRODUCT_DRAFT_STRING_FIELDS as readonly string[]).includes(field)) {
      const key = field as (typeof PRODUCT_DRAFT_STRING_FIELDS)[number];
      merged[key] = input.current[key] ?? null;
      continue;
    }
    if ((PRODUCT_DRAFT_LIST_FIELDS as readonly string[]).includes(field)) {
      const key = field as (typeof PRODUCT_DRAFT_LIST_FIELDS)[number];
      merged[key] = [...(input.current[key] ?? [])];
      continue;
    }
    if (field === "evidenceRefs") {
      merged.evidenceRefs = input.current.evidenceRefs ?? [];
    }
  }

  return merged;
}
