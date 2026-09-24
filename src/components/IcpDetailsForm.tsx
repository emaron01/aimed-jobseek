"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { deleteIcpAction, upsertIcpAction } from "@/app/actions";
import {
  approveStarterTargetEmployerAction,
  interpretIcpAction,
  previewStarterTargetEmployerAction,
} from "@/app/actions/interpretation";
import { IcpCriteriaBriefing } from "@/components/IcpBriefingDocument";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { IcpBriefingDocument } from "@/components/IcpBriefingDocument";
import {
  IcpCriteriaReview,
  type IcpCriterionReviewRow,
} from "@/components/IcpCriteriaReview";
import { Field, SecondaryButton, SubmitButton } from "@/components/ui";
import {
  icpRecordToFormValues,
  type IcpActionResult,
  type IcpClientRecord,
  type IcpFormValues,
} from "@/lib/icp/save";
import {
  EMPLOYMENT_TYPES,
  compensationConfig,
  compensationCopy,
  criterionFlags,
  employmentTypeLabel,
  icpLabels,
  vocab,
} from "@/lib/product-config";
import type { StarterTargetEmployerDraft } from "@/lib/icp/save";

type CriterionRow = IcpCriterionReviewRow;

const initialResult: IcpActionResult | null = null;

function StatusBanner({
  result,
  testId = "icp-action-status",
}: {
  result: IcpActionResult | null;
  testId?: string;
}) {
  if (!result) return null;
  return (
    <p
      role="status"
      data-testid={testId}
      className={
        result.ok
          ? "mb-3 text-sm text-emerald-700"
          : "mb-3 text-sm text-red-600"
      }
    >
      {result.message}
    </p>
  );
}

function EmployerCompensationFields({
  defaults,
  fieldHint,
}: {
  defaults: Partial<IcpFormValues>;
  fieldHint: (key: keyof IcpFormValues) => string | undefined;
}) {
  const selected = (defaults.employmentTypes ?? "")
    .split(",")
    .map((item) => item.trim());
  return (
    <div className="md:col-span-2 space-y-3" data-testid="employer-compensation-fields">
      <div>
        <p className="text-sm font-medium text-slate-900">
          {compensationCopy.annualEarningsLabel}
        </p>
        <p className="text-sm text-slate-600">{compensationCopy.annualEarningsHint}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label={compensationCopy.annualMinimumLabel}
          name="targetAnnualEarningsMin"
          type="number"
          defaultValue={defaults.targetAnnualEarningsMin}
          hint={fieldHint("targetAnnualEarningsMin")}
        />
        <Field
          label={compensationCopy.annualTargetLabel}
          name="targetAnnualEarningsTarget"
          type="number"
          defaultValue={defaults.targetAnnualEarningsTarget}
          hint={fieldHint("targetAnnualEarningsTarget")}
        />
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            name="annualEarningsMinimumRequired"
            value="true"
            defaultChecked={defaults.annualEarningsMinimumRequired === "true"}
          />
          {criterionFlags.required}
        </label>
      </div>
      <p className="text-sm font-medium text-slate-900">{compensationCopy.hourlyRateLabel}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label={compensationCopy.hourlyMinimumLabel}
          name="targetHourlyRateMin"
          type="number"
          defaultValue={defaults.targetHourlyRateMin}
          hint={fieldHint("targetHourlyRateMin")}
        />
        <Field
          label={compensationCopy.hourlyTargetLabel}
          name="targetHourlyRateTarget"
          type="number"
          defaultValue={defaults.targetHourlyRateTarget}
          hint={fieldHint("targetHourlyRateTarget")}
        />
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            name="hourlyRateMinimumRequired"
            value="true"
            defaultChecked={defaults.hourlyRateMinimumRequired === "true"}
          />
          {criterionFlags.required}
        </label>
      </div>
      <Field
        label={compensationCopy.currencyLabel}
        name="compensationCurrency"
        defaultValue={
          defaults.compensationCurrency || compensationConfig.defaultCurrency
        }
        hint={fieldHint("compensationCurrency")}
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-900">
          {compensationCopy.employmentTypeLabel}
        </legend>
        {EMPLOYMENT_TYPES.map((code) => (
          <label key={code} className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              name="employmentTypes"
              value={code}
              defaultChecked={selected.includes(code)}
            />
            {employmentTypeLabel(code)}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            name="employmentTypeRequired"
            value="true"
            defaultChecked={defaults.employmentTypeRequired === "true"}
          />
          {criterionFlags.required}
        </label>
        {fieldHint("employmentTypeRequired") ? (
          <p className="text-sm text-red-600">{fieldHint("employmentTypeRequired")}</p>
        ) : null}
      </fieldset>
    </div>
  );
}

function defaultsFromIcp(icp?: IcpClientRecord): Partial<IcpFormValues> {
  if (!icp) return {};
  return icpRecordToFormValues(icp);
}

function NewIcpForm({
  productId,
  profileApproved,
  autoDraftFromProfile,
}: {
  productId: string;
  productName?: string;
  profileApproved?: boolean;
  autoDraftFromProfile?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"choose" | "scratch" | "draft">(
    profileApproved ? "choose" : "scratch",
  );
  const [starterDraft, setStarterDraft] =
    useState<StarterTargetEmployerDraft | null>(null);
  const [state, formAction, pending] = useActionState(
    upsertIcpAction,
    initialResult,
  );
  const [interpretState, interpretAction, interpretPending] = useActionState(
    interpretIcpAction,
    initialResult,
  );
  const [previewState, previewAction, previewPending] = useActionState(
    previewStarterTargetEmployerAction,
    initialResult,
  );
  const [approveState, approveAction, approvePending] = useActionState(
    approveStarterTargetEmployerAction,
    initialResult,
  );

  const definitionPlaceholder = `Describe the companies you want to work for — size, industry, stage, geography, work arrangement, culture, and anything you will not consider.`;

  const activeState = mode === "draft" ? approveState : state;
  const restored =
    activeState && !activeState.ok ? activeState.values : undefined;
  const defaults: Partial<IcpFormValues> = useMemo(
    () => restored ?? (starterDraft
      ? {
          name: starterDraft.name,
          definition: starterDraft.definition,
          additionalContext: starterDraft.additionalContext,
          ...starterDraft.compensation,
        }
      : {}),
    [restored, starterDraft],
  );
  const existingIcpId = String(state?.icpId || defaults.id || "").trim();
  const formKey =
    activeState && !activeState.ok
      ? `icp-fail-${activeState.message}-${defaults.definition?.slice(0, 24) ?? ""}`
      : starterDraft
        ? `icp-draft-${starterDraft.name}`
        : "icp-new";

  useEffect(() => {
    if (!state?.ok || !state.icpId) return;
    router.push(`/setup/${productId}/icps/${state.icpId}`);
  }, [state, productId, router]);

  useEffect(() => {
    if (!approveState?.ok || !approveState.icpId) return;
    router.push(`/setup/${productId}/icps/${approveState.icpId}`);
  }, [approveState, productId, router]);

  useEffect(() => {
    if (interpretState?.ok) {
      router.refresh();
    }
  }, [interpretState, router]);

  if (previewState?.ok && previewState.starterDraft && starterDraft !== previewState.starterDraft) {
    setStarterDraft(previewState.starterDraft);
    setMode("draft");
  }

  const autoPreviewStarted = useRef(false);
  useEffect(() => {
    if (!autoDraftFromProfile || !profileApproved || autoPreviewStarted.current) {
      return;
    }
    autoPreviewStarted.current = true;
    const fd = new FormData();
    fd.set("productId", productId);
    startTransition(() => {
      previewAction(fd);
    });
  }, [autoDraftFromProfile, profileApproved, productId, previewAction]);

  function fieldHint(key: keyof IcpFormValues): string | undefined {
    if (!activeState || activeState.ok) return undefined;
    return activeState.fieldErrors?.[key];
  }

  if (profileApproved && mode === "choose") {
    return (
      <div
        className="rounded-md border border-slate-200 p-4 space-y-4"
        data-testid="icp-starter-offer"
      >
        <StatusBanner result={previewState} testId="icp-starter-preview-status" />
        <p className="text-sm text-slate-700">
          Draft {vocab.icp.aSingular} from the direction and career goals on
          your approved {vocab.product.singular}, or write one from scratch.
        </p>
        <div className="flex flex-wrap gap-2">
          <form action={previewAction}>
            <input type="hidden" name="productId" value={productId} />
            <SubmitButton disabled={previewPending}>
              {previewPending
                ? "Drafting…"
                : `Draft from my ${vocab.product.Singular}`}
            </SubmitButton>
          </form>
          <SecondaryButton type="button" onClick={() => setMode("scratch")}>
            Write from scratch
          </SecondaryButton>
        </div>
      </div>
    );
  }

  const savePending = mode === "draft" ? approvePending : pending;
  const saveAction = mode === "draft" ? approveAction : formAction;

  return (
    <div className="rounded-md border border-slate-200 p-4" data-testid="icp-form">
      <StatusBanner result={activeState} />
      <StatusBanner result={interpretState} testId="icp-interpret-status" />
      <StatusBanner result={previewState} testId="icp-starter-preview-status" />
      {mode === "draft" && starterDraft ? (
        <p
          className="mb-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900"
          data-testid="starter-draft-inference"
        >
          {criterionFlags.inference}
        </p>
      ) : null}
      <form
        key={formKey}
        action={saveAction}
        className="grid gap-4 md:grid-cols-2"
        data-testid="icp-details-form"
      >
        <input type="hidden" name="id" value={defaults.id ?? ""} />
        <input type="hidden" name="productId" value={productId} />
        <Field
          label={`${vocab.icp.singular} Name`}
          name="name"
          defaultValue={defaults.name}
          required
          hint={fieldHint("name")}
        />
        <Field
          label="Target Industries"
          name="targetIndustries"
          defaultValue={defaults.targetIndustries}
          placeholder="SaaS, Manufacturing"
          hint={fieldHint("targetIndustries")}
        />
        <div className="md:col-span-2">
          <Field
            label={`Describe your ${vocab.idealCustomer.singular}`}
            name="definition"
            defaultValue={defaults.definition}
            as="textarea"
            required
            placeholder={definitionPlaceholder}
            hint={fieldHint("definition")}
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Additional context (optional)"
            name="additionalContext"
            defaultValue={defaults.additionalContext}
            as="textarea"
            hint={fieldHint("additionalContext")}
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Short description (optional)"
            name="description"
            defaultValue={defaults.description}
            as="textarea"
            hint={fieldHint("description")}
          />
        </div>
        <EmployerCompensationFields defaults={defaults} fieldHint={fieldHint} />
        <Field
          label="Minimum Employees"
          name="minEmployees"
          type="number"
          defaultValue={defaults.minEmployees}
          hint={fieldHint("minEmployees")}
        />
        <Field
          label="Maximum Employees"
          name="maxEmployees"
          type="number"
          defaultValue={defaults.maxEmployees}
          hint={fieldHint("maxEmployees")}
        />
        <Field
          label="Minimum Revenue"
          name="minRevenue"
          type="number"
          defaultValue={defaults.minRevenue}
          hint={fieldHint("minRevenue")}
        />
        <Field
          label="Maximum Revenue"
          name="maxRevenue"
          type="number"
          defaultValue={defaults.maxRevenue}
          hint={fieldHint("maxRevenue")}
        />
        <Field
          label="Target Geographies"
          name="targetGeographies"
          defaultValue={defaults.targetGeographies}
          hint={fieldHint("targetGeographies")}
        />
        <Field
          label="Required Technologies"
          name="requiredTechnologies"
          defaultValue={defaults.requiredTechnologies}
          hint={fieldHint("requiredTechnologies")}
        />
        {mode === "draft" && starterDraft ? (
          <>
            <input
              type="hidden"
              name="starterCriteriaJson"
              value={JSON.stringify(starterDraft.criteria)}
            />
            <input
              type="hidden"
              name="interpretationSummary"
              value={starterDraft.interpretationSummary ?? ""}
            />
            <input
              type="hidden"
              name="interpretationUndetermined"
              value={starterDraft.interpretationUndetermined ?? ""}
            />
          </>
        ) : null}
        <Field
          label={`Positive ${vocab.employerSignal.TitlePlural}`}
          name="positiveSignals"
          defaultValue={defaults.positiveSignals}
          hint={fieldHint("positiveSignals")}
        />
        <Field
          label="Negative / Disqualifying Signals"
          name="negativeSignals"
          defaultValue={defaults.negativeSignals}
          hint={fieldHint("negativeSignals")}
        />
        <div className="md:col-span-2">
          <Field
            label="Additional Notes"
            name="notes"
            defaultValue={defaults.notes}
            as="textarea"
            hint={fieldHint("notes")}
          />
        </div>
        {mode === "draft" && starterDraft ? (
          <div className="md:col-span-2" data-testid="starter-draft-criteria">
            <IcpCriteriaBriefing
              criteria={starterDraft.criteria}
              interpretationSummary={starterDraft.interpretationSummary}
              interpretationUndetermined={starterDraft.interpretationUndetermined}
            />
          </div>
        ) : null}
        <div className="md:col-span-2 flex flex-wrap items-center gap-2">
          <SubmitButton disabled={savePending}>
            {savePending
              ? "Saving…"
              : mode === "draft"
                ? `Approve and save ${vocab.icp.singular}`
                : `Save ${vocab.icp.singular}`}
          </SubmitButton>
          {profileApproved && mode !== "choose" ? (
            <SecondaryButton
              type="button"
              onClick={() => {
                setStarterDraft(null);
                setMode("choose");
              }}
            >
              Back
            </SecondaryButton>
          ) : null}
          {existingIcpId ? (
            <SecondaryButton
              type="button"
              disabled={interpretPending}
              onClick={() => {
                const fd = new FormData();
                fd.set("icpId", existingIcpId);
                fd.set("productId", productId);
                interpretAction(fd);
              }}
            >
              {interpretPending
                ? "Interpreting…"
                : icpLabels.updateFromDescription}
            </SecondaryButton>
          ) : null}
        </div>
      </form>
    </div>
  );
}

/** Existing ICP — document by default; Edit reveals the form. */
export function IcpDetailsForm({
  productId,
  productName,
  icp,
  criteria,
  profileApproved,
  autoDraftFromProfile,
}: {
  productId: string;
  productName?: string;
  icp?: IcpClientRecord;
  criteria: CriterionRow[];
  profileApproved?: boolean;
  autoDraftFromProfile?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(
    upsertIcpAction,
    initialResult,
  );
  const [interpretState, interpretAction, interpretPending] = useActionState(
    interpretIcpAction,
    initialResult,
  );

  const definitionPlaceholder = `Describe the companies you want to work for — size, industry, stage, geography, work arrangement, culture, and anything you will not consider.`;

  const restored = state && !state.ok ? state.values : undefined;
  const defaults = useMemo(
    () => ({ ...defaultsFromIcp(icp), ...restored }),
    [icp, restored],
  );
  const formKey =
    state && !state.ok
      ? `icp-fail-${state.message}-${defaults.definition?.slice(0, 24) ?? ""}`
      : `icp-${icp?.id ?? "new"}`;

  if (state?.ok && editing) {
    setEditing(false);
  }

  useEffect(() => {
    if (!state?.ok) return;
    router.refresh();
  }, [state, router]);

  useEffect(() => {
    if (interpretState?.ok) {
      router.refresh();
    }
  }, [interpretState, router]);

  function fieldHint(key: keyof IcpFormValues): string | undefined {
    if (!state || state.ok) return undefined;
    return state.fieldErrors?.[key];
  }

  if (!icp) {
    return (
      <NewIcpForm
        productId={productId}
        productName={productName}
        profileApproved={profileApproved}
        autoDraftFromProfile={autoDraftFromProfile}
      />
    );
  }

  return (
    <div
      className="mx-auto max-w-3xl space-y-6"
      data-testid="icp-briefing"
      data-print-document
    >
      <div className="flex flex-wrap justify-end gap-2" data-print-hide>
        <ExportPdfButton />
        <SecondaryButton
          type="button"
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? "Done editing" : "Edit"}
        </SecondaryButton>
      </div>

      {!editing ? (
        <IcpBriefingDocument
          name={icp.name}
          definition={icp.definition}
          description={icp.description}
          targetIndustries={icp.targetIndustries}
          targetGeographies={icp.targetGeographies}
          criteria={criteria}
          interpretationSummary={icp.interpretationSummary}
          interpretationUndetermined={icp.interpretationUndetermined}
          compensation={{
            targetAnnualEarningsMin: icp.targetAnnualEarningsMin,
            targetAnnualEarningsTarget: icp.targetAnnualEarningsTarget,
            targetHourlyRateMin: icp.targetHourlyRateMin,
            targetHourlyRateTarget: icp.targetHourlyRateTarget,
            compensationCurrency: icp.compensationCurrency,
            employmentTypes: icp.employmentTypes,
            annualEarningsMinimumRequired: icp.annualEarningsMinimumRequired,
            hourlyRateMinimumRequired: icp.hourlyRateMinimumRequired,
            employmentTypeRequired: icp.employmentTypeRequired,
          }}
        />
      ) : null}

      {editing ? (
        <div
          className="rounded-md border border-slate-200 p-4"
          data-print-hide
          data-testid="icp-form"
        >
          <StatusBanner result={state} />
          <form
            key={formKey}
            action={formAction}
            className="grid gap-4 md:grid-cols-2"
            data-testid="icp-details-form"
          >
            <input type="hidden" name="id" value={icp.id} />
            <input type="hidden" name="productId" value={productId} />
            <Field
              label={`${vocab.icp.singular} Name`}
              name="name"
              defaultValue={defaults.name}
              required
              hint={fieldHint("name")}
            />
            <Field
              label="Target Industries"
              name="targetIndustries"
              defaultValue={defaults.targetIndustries}
              placeholder="SaaS, Manufacturing"
              hint={fieldHint("targetIndustries")}
            />
            <div className="md:col-span-2">
              <Field
                label={`Describe your ${vocab.idealCustomer.singular}`}
                name="definition"
                defaultValue={defaults.definition}
                as="textarea"
                required
                placeholder={definitionPlaceholder}
                hint={fieldHint("definition")}
              />
            </div>
            <div className="md:col-span-2">
              <Field
                label="Additional context (optional)"
                name="additionalContext"
                defaultValue={defaults.additionalContext}
                as="textarea"
                hint={fieldHint("additionalContext")}
              />
            </div>
            <div className="md:col-span-2">
              <Field
                label="Short description (optional)"
                name="description"
                defaultValue={defaults.description}
                as="textarea"
                hint={fieldHint("description")}
              />
            </div>
            <EmployerCompensationFields defaults={defaults} fieldHint={fieldHint} />
            <Field
              label="Minimum Employees"
              name="minEmployees"
              type="number"
              defaultValue={defaults.minEmployees}
              hint={fieldHint("minEmployees")}
            />
            <Field
              label="Maximum Employees"
              name="maxEmployees"
              type="number"
              defaultValue={defaults.maxEmployees}
              hint={fieldHint("maxEmployees")}
            />
            <Field
              label="Minimum Revenue"
              name="minRevenue"
              type="number"
              defaultValue={defaults.minRevenue}
              hint={fieldHint("minRevenue")}
            />
            <Field
              label="Maximum Revenue"
              name="maxRevenue"
              type="number"
              defaultValue={defaults.maxRevenue}
              hint={fieldHint("maxRevenue")}
            />
            <Field
              label="Target Geographies"
              name="targetGeographies"
              defaultValue={defaults.targetGeographies}
              hint={fieldHint("targetGeographies")}
            />
            <Field
              label="Required Technologies"
              name="requiredTechnologies"
              defaultValue={defaults.requiredTechnologies}
              hint={fieldHint("requiredTechnologies")}
            />
            <Field
              label={`Positive ${vocab.employerSignal.TitlePlural}`}
              name="positiveSignals"
              defaultValue={defaults.positiveSignals}
              hint={fieldHint("positiveSignals")}
            />
            <Field
              label="Negative / Disqualifying Signals"
              name="negativeSignals"
              defaultValue={defaults.negativeSignals}
              hint={fieldHint("negativeSignals")}
            />
            <div className="md:col-span-2">
              <Field
                label="Additional Notes"
                name="notes"
                defaultValue={defaults.notes}
                as="textarea"
                hint={fieldHint("notes")}
              />
            </div>
            <div className="md:col-span-2 flex flex-wrap items-center gap-2">
              <SubmitButton disabled={pending}>
                {pending ? "Saving…" : `Save ${vocab.icp.singular}`}
              </SubmitButton>
              <SecondaryButton
                type="button"
                disabled={interpretPending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("icpId", icp.id);
                  fd.set("productId", productId);
                  interpretAction(fd);
                }}
              >
                {interpretPending
                  ? "Interpreting…"
                  : icpLabels.updateFromDescription}
              </SecondaryButton>
            </div>
          </form>
          <IcpCriteriaReview
            title="AI Interpretation"
            productId={productId}
            icpId={icp.id}
            criteria={criteria}
            interpretationSummary={icp.interpretationSummary}
            interpretationUndetermined={icp.interpretationUndetermined}
          />
        </div>
      ) : null}

      <div className="space-y-3 border-t border-slate-200 pt-4" data-print-hide>
        <StatusBanner
          result={interpretState}
          testId="icp-interpret-status"
        />
        <form action={interpretAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="icpId" value={icp.id} />
          <input type="hidden" name="productId" value={productId} />
          <SecondaryButton type="submit" disabled={interpretPending}>
            {interpretPending
              ? "Interpreting…"
              : icpLabels.updateFromDescription}
          </SecondaryButton>
        </form>
        <ConfirmDeleteForm
          action={deleteIcpAction}
          hiddenFields={{ id: icp.id, productId }}
          triggerLabel={`Delete ${vocab.icp.singular}`}
          confirmTitle={`Delete ${vocab.icp.singular} "${icp.name}"?`}
          confirmBody={`This will remove this ${vocab.icp.singular} and its current generated criteria.\nHistorical scoring snapshots will not be changed.\nIf scoring runs reference this ${vocab.icp.singular}, it will be archived instead of permanently deleted.`}
          confirmButtonLabel={`Delete ${vocab.icp.singular}`}
          onSuccessNavigate={`/setup/${productId}`}
        />
      </div>
    </div>
  );
}
