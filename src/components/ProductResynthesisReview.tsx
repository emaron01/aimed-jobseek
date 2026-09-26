"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyProductResynthesisAction,
  retryApprovedProductResynthesisAction,
  type ProductSetupActionResult,
} from "@/app/actions/product-setup";
import {SecondaryButton, SubmitButton, AppActionLink } from "@/components/ui";
import type { CandidateProfile } from "@/lib/product-research/candidate-profile";
import {
  buildProductResynthesisApplyPlan,
  productDraftFromApprovedProfile,
} from "@/lib/product-research/resynthesize-approved-plan";
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
      ? "border-success bg-success-tint text-success"
      : "border-warning bg-warning-tint text-warning";

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

export function ProductResynthesisReview({
  productId,
  productName,
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
  setupRunId: string;
  evidenceBundleId: string;
  draft: CandidateProfile | null;
  failed?: boolean;
  errorSafe?: string | null;
  beforeProfile: CandidateProfile;
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

  const [profile, setProfile] = useState<CandidateProfile>(() =>
    productDraftFromApprovedProfile(draft ?? beforeProfile),
  );

  const [appliedDraft, setAppliedDraft] = useState(draft);
  if (draft && draft !== appliedDraft) {
    setAppliedDraft(draft);
    setProfile(productDraftFromApprovedProfile(draft));
  }

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

  const applyPlan = useMemo(
    () =>
      buildProductResynthesisApplyPlan({
        product: {
          id: productId,
          name: productName,
          manuallyEditedFields,
        },
        before: beforeProfile,
        after: profile,
      }),
    [productId, productName, manuallyEditedFields, beforeProfile, profile],
  );

  if (failed || !draft) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-warning">
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
          <AppActionLink
            href={`/setup/${productId}/research`}
            variant="secondary"
          >
            Cancel
          </AppActionLink>
        </form>
        {retry ? (
          <p className="text-sm text-danger">{retry.message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="product-resynthesis-review">
      <p className="text-sm text-muted">
        Review the proposed update for <strong>{productName}</strong>. Confirm
        only replaces the fields listed below — your {vocab.product.singular} id,{" "}
        {vocab.campaign.plural}, and {vocab.icp.plural} stay linked. Cancel leaves
        the {vocab.product.singular} untouched.
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

      {applyPlan.fieldDiffs.length > 0 ? (
        <div className="space-y-4">
          {applyPlan.fieldDiffs.map((diff) => (
            <div
              key={diff.field}
              className="rounded-lg border border-edge bg-surface"
            >
              <div className="border-b border-edge px-4 py-2">
                <h3 className="text-sm font-semibold text-ink">
                  {diff.label}
                </h3>
                <p className="mt-0.5 text-xs text-warning">
                  Will change on confirm
                </p>
              </div>
              <div className="grid gap-0 md:grid-cols-2">
                <div className="border-b border-edge p-4 md:border-b-0 md:border-r">
                  <p className="text-xs font-medium uppercase tracking-wide text-subtle">
                    Current
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
                    {diff.before.trim() || "—"}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-subtle">
                    Proposed
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
                    {diff.after.trim() || "—"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <form action={action} className="space-y-4 border-t border-edge pt-5">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="setupRunId" value={setupRunId} />
        <input
          type="hidden"
          name="candidateProfileJson"
          value={JSON.stringify(profile)}
        />

        <div className="flex flex-wrap gap-2">
          <SubmitButton disabled={pending}>
            {pending ? "Applying…" : "Confirm update"}
          </SubmitButton>
          <AppActionLink
            href={`/setup/${productId}/research`}
            variant="secondary"
          >
            Cancel
          </AppActionLink>
        </div>
        {state ? (
          <p
            className={
              state.ok ? "text-sm text-success" : "text-sm text-danger"
            }
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
