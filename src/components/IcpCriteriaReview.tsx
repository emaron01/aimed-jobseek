"use client";
import { AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  decideIcpTargetedSearchAction,
  updateIcpCriterionTierAction,
} from "@/app/actions/interpretation";
import {
  criterionMaterialFingerprint,
  isLimitedPublicEvidenceClass,
  isTargetedSearchDecisionStale,
  LIMITED_PUBLIC_EVIDENCE_CRITERION_WARNING,
  normalizeEvidenceClass,
  type CriterionEvidenceClassValue,
  type TargetedSearchDecisionValue,
} from "@/lib/criteria/evidence-class";
import {
  buildIcpRoleSummary,
  ICP_MANDATORY_EXPLANATION,
  ICP_PRIMARY_ROLE_LABEL,
  ICP_PRIMARY_TIER_HEADER,
  ICP_SECONDARY_ROLE_LABEL,
  ICP_SECONDARY_TIER_HEADER,
  normalizeIcpCriterionTier,
  type IcpCriterionTierValue,
} from "@/lib/criteria/tier";
import { formatCriterionDisplay } from "@/lib/criteria/types";
import { criterionFlagLabels, criterionFlags } from "@/lib/product-config";

export type IcpCriterionReviewRow = {
  id?: string;
  name: string;
  description?: string | null;
  importance: string;
  isDisqualifier: boolean;
  isRequired: boolean;
  strengthAdjustment?: string | null;
  manuallyEdited?: boolean;
  dataType: string;
  operator: string;
  targetValue?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
  allowedValues?: unknown;
  sortOrder: number;
  criterionType: string;
  evidenceClass?: CriterionEvidenceClassValue | string | null;
  evidenceClassLocked?: boolean;
  targetedSearchDecision?: TargetedSearchDecisionValue | null;
  targetedSearchDecisionFingerprint?: string | null;
  tier?: IcpCriterionTierValue | string | null;
  isMandatory?: boolean;
};

const TARGETED_SEARCH_CRITERION_WARNING =
  "May not be verifiable online. Confirmed matches help; missing evidence is never held against a company.";

function DecisionForm({
  productId,
  icpId,
  criterion,
}: {
  productId: string;
  icpId: string;
  criterion: IcpCriterionReviewRow;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    decideIcpTargetedSearchAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (!criterion.id) return null;

  return (
    <div className="mt-2 space-y-2" data-testid="targeted-search-decision">
      <div className="flex flex-wrap gap-2">
        <form action={action}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="icpId" value={icpId} />
          <input type="hidden" name="criterionId" value={criterion.id} />
          <input type="hidden" name="decision" value="KEEP_ASYMMETRIC" />
          <AppButton
            type="submit"
            disabled={pending}
            className={cn("!px-2.5", "!py-1.5", "!text-xs")}
          >
            Keep — confirm when found, never penalize when not found
          </AppButton>
        </form>
        <form action={action}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="icpId" value={icpId} />
          <input type="hidden" name="criterionId" value={criterion.id} />
          <input type="hidden" name="decision" value="MAKE_SUPPORTING" />
          <AppButton
            type="submit"
            disabled={pending}
            variant="secondary" className={cn("px-2.5", "!px-2.5", "!py-1.5", "!text-xs")}
          >
            Make supporting
          </AppButton>
        </form>
        <form action={action}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="icpId" value={icpId} />
          <input type="hidden" name="criterionId" value={criterion.id} />
          <input type="hidden" name="decision" value="REMOVE" />
          <AppButton
            type="submit"
            disabled={pending}
            className="rounded-md border border-danger bg-surface px-2.5 py-1.5 text-xs font-medium text-danger disabled:opacity-60"
          >
            Remove this criterion
          </AppButton>
        </form>
      </div>
      {state && !state.ok ? (
        <p role="status" className="text-xs text-danger">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function TierAndMandatoryForm({
  productId,
  icpId,
  criterion,
}: {
  productId: string;
  icpId: string;
  criterion: IcpCriterionReviewRow;
}) {
  const router = useRouter();
  const initialTier = normalizeIcpCriterionTier(criterion.tier) ?? "PRIMARY";
  const [tier, setTier] = useState<IcpCriterionTierValue>(initialTier);
  const [state, action, pending] = useActionState(
    updateIcpCriterionTierAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (!criterion.id) return null;

  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="icpId" value={icpId} />
      <input type="hidden" name="criterionId" value={criterion.id} />
      <label className="text-xs text-muted">
        Scoring role
        <select
          name="tier"
          value={tier}
          disabled={pending}
          onChange={(event) =>
            setTier(normalizeIcpCriterionTier(event.target.value) ?? "PRIMARY")
          }
          className="ml-2 rounded border border-edge-strong bg-surface px-2 py-1 text-xs"
        >
          <option value="PRIMARY">{ICP_PRIMARY_ROLE_LABEL}</option>
          <option value="SECONDARY">{ICP_SECONDARY_ROLE_LABEL}</option>
        </select>
      </label>
      {tier === "PRIMARY" ? (
        <label
          className="flex items-center gap-1.5 text-xs font-medium text-danger"
          title={ICP_MANDATORY_EXPLANATION}
          data-testid="icp-mandatory-toggle"
        >
          <input
            type="checkbox"
            name="isMandatory"
            value="true"
            defaultChecked={Boolean(criterion.isMandatory)}
            disabled={pending}
            className="accent-red-700"
          />
          Mandatory
        </label>
      ) : null}
      <AppButton
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-ink underline disabled:opacity-60"
      >
        {pending ? "Saving…" : "Update"}
      </AppButton>
      {state && !state.ok ? (
        <p className="w-full text-xs text-danger">{state.message}</p>
      ) : null}
    </form>
  );
}

function CriterionCard({
  productId,
  icpId,
  criterion,
}: {
  productId: string;
  icpId: string;
  criterion: IcpCriterionReviewRow;
}) {
  const evidenceClass = normalizeEvidenceClass(criterion.evidenceClass);
  const fingerprint = criterionMaterialFingerprint({
    name: criterion.name,
    description: criterion.description,
    criterionType: criterion.criterionType,
    evidenceClass,
    operator: criterion.operator,
    targetValue: criterion.targetValue,
    minValue: criterion.minValue,
    maxValue: criterion.maxValue,
    allowedValues: criterion.allowedValues,
  });
  const needsDecision =
    evidenceClass === "TARGETED_SEARCH" &&
    isTargetedSearchDecisionStale({
      decision: criterion.targetedSearchDecision,
      storedFingerprint: criterion.targetedSearchDecisionFingerprint,
      currentFingerprint: fingerprint,
    });

  return (
    <li
      className="rounded-md border border-edge bg-surface p-3 text-sm text-ink"
      data-testid="icp-criterion-card"
      data-evidence-class={evidenceClass}
      data-tier={normalizeIcpCriterionTier(criterion.tier) ?? "PRIMARY"}
    >
      <p className="font-medium">
        {formatCriterionDisplay({
          ...criterion,
          dataType: criterion.dataType as never,
          operator: criterion.operator as never,
          importance: criterion.importance as never,
          evidenceClass,
          tier: normalizeIcpCriterionTier(criterion.tier) ?? undefined,
        })}
        {criterionFlagLabels(criterion).map((label) => (
          <span
            key={label}
            className="ml-2 inline-block rounded-full border border-edge bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink"
            data-testid={
              label === criterionFlags.required
                ? "criterion-flag-required"
                : "criterion-flag-disqualifier"
            }
          >
            {label}
          </span>
        ))}
      </p>
      <TierAndMandatoryForm
        key={`${criterion.id}-${criterion.tier}-${String(criterion.isMandatory)}`}
        productId={productId}
        icpId={icpId}
        criterion={criterion}
      />
      {evidenceClass === "TARGETED_SEARCH" ? (
        <p
          className="mt-2 text-xs text-warning"
          data-testid="targeted-search-warning"
        >
          {TARGETED_SEARCH_CRITERION_WARNING}
        </p>
      ) : null}
      {isLimitedPublicEvidenceClass(evidenceClass) ? (
        <p
          className="mt-2 text-xs text-warning"
          data-testid="limited-public-evidence-warning"
        >
          {LIMITED_PUBLIC_EVIDENCE_CRITERION_WARNING}
        </p>
      ) : null}
      {criterion.strengthAdjustment ? (
        <p
          className="mt-2 text-xs text-muted"
          data-testid="criterion-strength-adjustment"
        >
          {criterion.strengthAdjustment}
        </p>
      ) : null}
      {needsDecision ? (
        <DecisionForm productId={productId} icpId={icpId} criterion={criterion} />
      ) : null}
    </li>
  );
}

function TierSection({
  title,
  productId,
  icpId,
  criteria,
}: {
  title: string;
  productId: string;
  icpId: string;
  criteria: IcpCriterionReviewRow[];
}) {
  if (criteria.length === 0) return null;
  return (
    <section>
      <h6 className="text-sm font-semibold text-ink">{title}</h6>
      <ul className="mt-2 space-y-2">
        {criteria.map((c) => (
          <CriterionCard
            key={c.id ?? c.name}
            productId={productId}
            icpId={icpId}
            criterion={c}
          />
        ))}
      </ul>
    </section>
  );
}

export function IcpCriteriaReview({
  title,
  productId,
  icpId,
  criteria,
  interpretationSummary,
  interpretationUndetermined,
}: {
  title: string;
  productId: string;
  icpId: string;
  criteria: IcpCriterionReviewRow[];
  interpretationSummary?: string | null;
  interpretationUndetermined?: string | null;
}) {
  if (criteria.length === 0) {
    return (
      <p className="mt-3 text-sm text-subtle">
        No structured criteria yet. Save a natural-language definition, then run
        AI Interpretation.
      </p>
    );
  }

  const withClass = criteria.map((c) => ({
    ...c,
    evidenceClass: normalizeEvidenceClass(c.evidenceClass),
    tier: normalizeIcpCriterionTier(c.tier) ?? "PRIMARY",
  }));
  const primary = withClass.filter((c) => c.tier === "PRIMARY");
  const secondary = withClass.filter((c) => c.tier === "SECONDARY");

  return (
    <div className="mt-4 space-y-4" data-testid="icp-criteria-review">
      <div>
        <h5 className="text-sm font-semibold text-ink">{title}</h5>
        {interpretationSummary?.trim() ? (
          <div
            className="mt-2 space-y-2 rounded-md border border-edge-strong bg-surface px-3 py-3"
            data-testid="icp-interpretation-prose"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
              What we understood
            </p>
            <p className="text-sm text-ink">{interpretationSummary.trim()}</p>
            {interpretationUndetermined?.trim() ? (
              <div data-testid="icp-interpretation-undetermined">
                <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                  Could not be determined from available data
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-warning">
                  {interpretationUndetermined
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        <p
          className="mt-2 text-sm text-ink"
          data-testid="icp-role-summary"
        >
          {buildIcpRoleSummary({
            primaryCount: primary.length,
            secondaryCount: secondary.length,
          })}
        </p>
      </div>

      {primary.length > 0 ? (
        <div data-testid="icp-primary-tier">
          <TierSection
            title={ICP_PRIMARY_TIER_HEADER}
            productId={productId}
            icpId={icpId}
            criteria={primary}
          />
        </div>
      ) : null}
      {secondary.length > 0 ? (
        <div data-testid="icp-secondary-tier">
          <TierSection
            title={ICP_SECONDARY_TIER_HEADER}
            productId={productId}
            icpId={icpId}
            criteria={secondary}
          />
        </div>
      ) : null}
    </div>
  );
}
