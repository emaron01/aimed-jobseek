"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyProductResynthesisAction,
  retryApprovedProductResynthesisAction,
  type ProductSetupActionResult,
} from "@/app/actions/product-setup";
import { AutosizeTextarea } from "@/components/AutosizeTextarea";
import { SECONDARY_BUTTON_CLASS, SecondaryButton, SubmitButton } from "@/components/ui";
import type { ProductDraft } from "@/lib/product-research/contract";
import {
  buildProductResynthesisApplyPlan,
  productDraftFromApprovedProfile,
} from "@/lib/product-research/resynthesize-approved-plan";
import {
  PRODUCT_DRAFT_FIELD_LABELS,
  PRODUCT_DRAFT_LIST_FIELDS,
  PRODUCT_DRAFT_STRING_FIELDS,
  stringifyDraftList,
  type ProductDraftListField,
  type ProductDraftStringField,
} from "@/lib/product-research/review";
import { vocab } from "@/lib/product-config";

const initial: ProductSetupActionResult | null = null;

function ApplyPlanList({
  title,
  items,
  tone,
}: {
  title: string;
  items: Array<{ label: string; detail?: string }>;
  tone: "preserved" | "replaced";
}) {
  if (items.length === 0) return null;
  const toneClass =
    tone === "preserved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : "border-amber-200 bg-amber-50 text-amber-950";

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={`${item.label}-${item.detail ?? ""}`}>
            <span className="font-medium">{item.label}</span>
            {item.detail ? (
              <span className="block text-xs opacity-90">{item.detail}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldCompare({
  label,
  before,
  after,
  name,
  onAfterChange,
  multiline = true,
}: {
  label: string;
  before: string;
  after: string;
  name: string;
  onAfterChange: (value: string) => void;
  multiline?: boolean;
}) {
  const changed = before.trim() !== after.trim();
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-2">
        <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
        {changed ? (
          <p className="mt-0.5 text-xs text-amber-800">Will change on confirm</p>
        ) : (
          <p className="mt-0.5 text-xs text-slate-500">Unchanged</p>
        )}
      </div>
      <div className="grid gap-0 md:grid-cols-2">
        <div className="border-b border-slate-100 p-4 md:border-b-0 md:border-r">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Current
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
            {before.trim() || "—"}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Proposed
          </p>
          {multiline ? (
            <AutosizeTextarea
              name={name}
              value={after}
              minRows={4}
              onChange={(event) => onAfterChange(event.target.value)}
              className="mt-2 w-full resize-none overflow-hidden rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 focus:ring-2"
            />
          ) : (
            <input
              name={name}
              value={after}
              onChange={(event) => onAfterChange(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 focus:ring-2"
            />
          )}
        </div>
      </div>
    </div>
  );
}

type CompareField =
  | { kind: "string"; key: ProductDraftStringField }
  | { kind: "list"; key: ProductDraftListField };

const COMPARE_FIELDS: CompareField[] = [
  ...PRODUCT_DRAFT_STRING_FIELDS.map(
    (key) => ({ kind: "string", key }) as CompareField,
  ),
  ...PRODUCT_DRAFT_LIST_FIELDS.filter((key) => key !== "unknownFields").map(
    (key) => ({ kind: "list", key }) as CompareField,
  ),
];

export function ProductResynthesisReview({
  productId,
  productName,
  websiteUrl,
  setupRunId,
  evidenceBundleId,
  draft,
  failed,
  errorSafe,
  beforeProfile,
  manuallyEditedFields,
}: {
  productId: string;
  productName: string;
  websiteUrl: string | null;
  setupRunId: string;
  evidenceBundleId: string;
  draft: ProductDraft | null;
  failed?: boolean;
  errorSafe?: string | null;
  beforeProfile: ProductDraft;
  manuallyEditedFields: unknown;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    applyProductResynthesisAction,
    initial,
  );
  const [retry, retryAction, retryPending] = useActionState(
    retryApprovedProductResynthesisAction,
    initial,
  );

  const [profile, setProfile] = useState<ProductDraft>(() =>
    productDraftFromApprovedProfile(draft ?? beforeProfile),
  );

  useEffect(() => {
    if (draft) setProfile(productDraftFromApprovedProfile(draft));
  }, [draft]);

  useEffect(() => {
    if (state?.ok) {
      router.push(`/setup/${productId}/research`);
      router.refresh();
    }
  }, [state, productId, router]);

  useEffect(() => {
    if (retry?.ok && retry.setupRunId) {
      router.push(
        `/setup/${productId}/research/resynthesis/${retry.setupRunId}`,
      );
      router.refresh();
    }
  }, [retry, productId, router]);

  const afterProfile = useMemo(() => profile, [profile]);

  const applyPlan = useMemo(
    () =>
      buildProductResynthesisApplyPlan({
        product: {
          id: productId,
          name: productName,
          manuallyEditedFields,
        },
        before: beforeProfile,
        after: afterProfile,
      }),
    [productId, productName, manuallyEditedFields, beforeProfile, afterProfile],
  );

  function fieldBefore(field: CompareField): string {
    if (field.kind === "string") {
      return (beforeProfile[field.key] ?? "").trim();
    }
    return stringifyDraftList(beforeProfile[field.key]);
  }

  function fieldAfter(field: CompareField): string {
    if (field.kind === "string") {
      return (profile[field.key] ?? "").trim();
    }
    return stringifyDraftList(profile[field.key]);
  }

  function setFieldAfter(field: CompareField, value: string) {
    setProfile((prev) => {
      if (field.kind === "string") {
        return { ...prev, [field.key]: value };
      }
      return {
        ...prev,
        [field.key]: value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      };
    });
  }

  if (failed || !draft) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-amber-900">
          {errorSafe ||
            `Re-synthesis could not be completed. Your approved ${vocab.product.singular} was not changed.`}
        </p>
        <form action={retryAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="setupRunId" value={setupRunId} />
          <input type="hidden" name="evidenceBundleId" value={evidenceBundleId} />
          <SecondaryButton type="submit" disabled={retryPending}>
            {retryPending ? "Retrying…" : "Retry re-synthesis"}
          </SecondaryButton>
          <Link
            href={`/setup/${productId}/research`}
            className={SECONDARY_BUTTON_CLASS}
          >
            Cancel
          </Link>
        </form>
        {retry ? (
          <p className="text-sm text-red-600">{retry.message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="product-resynthesis-review">
      <p className="text-sm text-slate-600">
        Review the proposed update for <strong>{productName}</strong>. Confirm
        only replaces the fields listed below — your {vocab.product.singular} id, {vocab.campaign.plural},
        {vocab.icp.plural}, {vocab.persona.plural}, and scoring runs stay linked. Cancel leaves the {vocab.product.singular}
        untouched.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <ApplyPlanList
          title="Preserved on confirm"
          items={applyPlan.preserved}
          tone="preserved"
        />
        <ApplyPlanList
          title="Replaced on confirm"
          items={applyPlan.replaced}
          tone="replaced"
        />
      </div>

      <div className="space-y-4">
        {COMPARE_FIELDS.map((field) => (
          <FieldCompare
            key={field.key}
            label={PRODUCT_DRAFT_FIELD_LABELS[field.key] ?? field.key}
            before={fieldBefore(field)}
            after={fieldAfter(field)}
            name={field.key}
            onAfterChange={(value) => setFieldAfter(field, value)}
          />
        ))}
      </div>

      <form action={action} className="space-y-4 border-t border-slate-200 pt-5">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="setupRunId" value={setupRunId} />
        <input type="hidden" name="name" value={productName} />
        <input type="hidden" name="websiteUrl" value={websiteUrl ?? ""} />
        <input
          type="hidden"
          name="evidenceRefsJson"
          value={JSON.stringify(profile.evidenceRefs ?? [])}
        />
        {PRODUCT_DRAFT_STRING_FIELDS.map((key) => (
          <input
            key={key}
            type="hidden"
            name={key}
            value={(profile[key] ?? "") as string}
          />
        ))}
        {PRODUCT_DRAFT_LIST_FIELDS.map((key) => (
          <input
            key={key}
            type="hidden"
            name={key}
            value={stringifyDraftList(profile[key])}
          />
        ))}

        <div className="flex flex-wrap gap-2">
          <SubmitButton disabled={pending}>
            {pending ? "Applying…" : "Confirm update"}
          </SubmitButton>
          <Link
            href={`/setup/${productId}/research`}
            className={SECONDARY_BUTTON_CLASS}
          >
            Cancel
          </Link>
        </div>
        {state ? (
          <p
            className={
              state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"
            }
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
