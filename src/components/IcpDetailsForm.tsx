"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteIcpAction, upsertIcpAction } from "@/app/actions";
import { interpretIcpAction } from "@/app/actions/interpretation";
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
import { vocab } from "@/lib/product-config";

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

function defaultsFromIcp(icp?: IcpClientRecord): Partial<IcpFormValues> {
  if (!icp) return {};
  return icpRecordToFormValues(icp);
}

function NewIcpForm({
  productId,
  productName,
}: {
  productId: string;
  productName?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    upsertIcpAction,
    initialResult,
  );
  const [interpretState, interpretAction, interpretPending] = useActionState(
    interpretIcpAction,
    initialResult,
  );

  const definitionPlaceholder = productName?.trim()
    ? `Describe companies that should buy ${productName.trim()} — industry, size, geography, and other fit signals.`
    : `Describe the companies that should buy this ${vocab.product.singular} — industry, size, geography, and other fit signals.`;

  const restored = state && !state.ok ? state.values : undefined;
  const defaults: Partial<IcpFormValues> = useMemo(
    () => restored ?? {},
    [restored],
  );
  const existingIcpId = String(state?.icpId || defaults.id || "").trim();
  const formKey =
    state && !state.ok
      ? `icp-fail-${state.message}-${defaults.definition?.slice(0, 24) ?? ""}`
      : "icp-new";

  useEffect(() => {
    if (!state?.ok || !state.icpId) return;
    router.push(`/setup/${productId}/icps/${state.icpId}`);
  }, [state, productId, router]);

  useEffect(() => {
    if (interpretState?.ok) {
      router.refresh();
    }
  }, [interpretState, router]);

  function fieldHint(key: keyof IcpFormValues): string | undefined {
    if (!state || state.ok) return undefined;
    return state.fieldErrors?.[key];
  }

  return (
    <div className="rounded-md border border-slate-200 p-4" data-testid="icp-form">
      <StatusBanner result={state} />
      <StatusBanner result={interpretState} testId="icp-interpret-status" />
      <form
        key={formKey}
        action={formAction}
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
          label={`Positive ${vocab.buyingSignal.TitlePlural}`}
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
                : `Interpret / Reinterpret ${vocab.icp.singular}`}
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
}: {
  productId: string;
  productName?: string;
  icp?: IcpClientRecord;
  criteria: CriterionRow[];
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

  const definitionPlaceholder = productName?.trim()
    ? `Describe companies that should buy ${productName.trim()} — industry, size, geography, and other fit signals.`
    : `Describe the companies that should buy this ${vocab.product.singular} — industry, size, geography, and other fit signals.`;

  const restored = state && !state.ok ? state.values : undefined;
  const defaults = useMemo(
    () => ({ ...defaultsFromIcp(icp), ...restored }),
    [icp, restored],
  );
  const formKey =
    state && !state.ok
      ? `icp-fail-${state.message}-${defaults.definition?.slice(0, 24) ?? ""}`
      : `icp-${icp?.id ?? "new"}`;

  useEffect(() => {
    if (!state?.ok) return;
    setEditing(false);
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
    return <NewIcpForm productId={productId} productName={productName} />;
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
              label={`Positive ${vocab.buyingSignal.TitlePlural}`}
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
                  : `Interpret / Reinterpret ${vocab.icp.singular}`}
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
              : `Interpret / Reinterpret ${vocab.icp.singular}`}
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
