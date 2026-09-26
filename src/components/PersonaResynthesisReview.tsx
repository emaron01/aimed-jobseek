"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyPersonaResynthesisAction,
  retryPersonaSynthesisAction,
  type PersonaSetupActionResult,
} from "@/app/actions/persona-setup";
import { AutosizeTextarea } from "@/components/AutosizeTextarea";
import { SECONDARY_BUTTON_CLASS, SecondaryButton, SubmitButton } from "@/components/ui";
import type { PersonaAiDraft } from "@/lib/persona-research/contract";
import {
  buildPersonaCriteriaForReview,
  parsePersonaCriteriaFormJson,
  type PersonaCriterionFormRow,
} from "@/lib/persona-research/project-signals";
import {
  buildPersonaResynthesisApplyPlan,
  draftFieldsToTextSnapshot,
  type PersonaResynthesisTextSnapshot,
} from "@/lib/persona-research/resynthesize-approved-plan";
import { vocab } from "@/lib/product-config";

const initial: PersonaSetupActionResult | null = null;

function draftToFormState(draft: PersonaAiDraft) {
  return {
    department: draft.departmentFunction ?? "",
    seniority: draft.seniority ?? "",
    definition: draft.roleSummary ?? "",
    responsibilities: draft.primaryResponsibilities.join("\n"),
    painPoints: draft.painPoints.join("\n"),
    desiredOutcomes: draft.desiredOutcomesFromSolution.join("\n"),
    messagingNotes: draft.messagingNotes.join("\n"),
  };
}

function FieldCompare({
  label,
  before,
  after,
  name,
  onAfterChange,
}: {
  label: string;
  before: string;
  after: string;
  name: string;
  onAfterChange: (value: string) => void;
}) {
  const changed = before.trim() !== after.trim();
  return (
    <div className="rounded-lg border border-edge bg-surface">
      <div className="border-b border-edge px-4 py-2">
        <h3 className="text-sm font-semibold text-ink">{label}</h3>
        {changed ? (
          <p className="mt-0.5 text-xs text-warning">Will change on confirm</p>
        ) : (
          <p className="mt-0.5 text-xs text-subtle">Unchanged</p>
        )}
      </div>
      <div className="grid gap-0 md:grid-cols-2">
        <div className="border-b border-edge p-4 md:border-b-0 md:border-r">
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">
            Current
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
            {before.trim() || "—"}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">
            Proposed
          </p>
          <AutosizeTextarea
            name={name}
            value={after}
            minRows={4}
            onChange={(event) => onAfterChange(event.target.value)}
            className="mt-2 w-full resize-none overflow-hidden rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm text-ink outline-none ring-focus focus:ring-2"
          />
        </div>
      </div>
    </div>
  );
}

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

export function PersonaResynthesisReview({
  productId,
  personaId,
  personaName,
  personaSetupRunId,
  draft,
  failed,
  errorSafe,
  beforeSnapshot,
  manuallyEditedFields,
  targetTitles,
  existingCriteria,
  maxProjectedPersonaCriteria = 15,
}: {
  productId: string;
  personaId: string;
  personaName: string;
  personaSetupRunId: string;
  draft: PersonaAiDraft | null;
  failed?: boolean;
  errorSafe?: string | null;
  beforeSnapshot: PersonaResynthesisTextSnapshot;
  manuallyEditedFields: unknown;
  targetTitles: unknown;
  existingCriteria: Array<{
    id: string;
    name: string;
    criterionType: string;
    manuallyEdited: boolean;
  }>;
  maxProjectedPersonaCriteria?: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    applyPersonaResynthesisAction,
    initial,
  );
  const [retry, retryAction, retryPending] = useActionState(
    retryPersonaSynthesisAction,
    initial,
  );

  const reviewResult = useMemo(
    () =>
      draft
        ? buildPersonaCriteriaForReview(draft, {
            maxCriteria: maxProjectedPersonaCriteria,
          })
        : {
            criteria: [] as PersonaCriterionFormRow[],
            droppedCount: 0,
            unmappedCriterionTypes: [] as string[],
            missingExclusionCriteria: true,
          },
    [draft, maxProjectedPersonaCriteria],
  );

  const [criteriaJson, setCriteriaJson] = useState("[]");
  const [formState, setFormState] = useState(() =>
    draft ? draftToFormState(draft) : {
      department: "",
      seniority: "",
      definition: "",
      responsibilities: "",
      painPoints: "",
      desiredOutcomes: "",
      messagingNotes: "",
    },
  );

  const draftSyncKey = draft
    ? `${draft.name}\0${JSON.stringify(reviewResult.criteria)}`
    : "";
  const [appliedDraftKey, setAppliedDraftKey] = useState(draftSyncKey);
  if (draft && draftSyncKey !== appliedDraftKey) {
    setAppliedDraftKey(draftSyncKey);
    setFormState(draftToFormState(draft));
    setCriteriaJson(JSON.stringify(reviewResult.criteria));
  }

  useEffect(() => {
    if (state?.ok) {
      router.push(`/setup/${productId}/personas/manage/${personaId}`);
      router.refresh();
    }
  }, [state, productId, personaId, router]);

  useEffect(() => {
    if (retry?.ok && retry.personaSetupRunId) {
      router.push(
        `/setup/${productId}/personas/manage/${personaId}/rebuild/${retry.personaSetupRunId}`,
      );
      router.refresh();
    }
  }, [retry, productId, personaId, router]);

  const proposedCriteria = useMemo(
    () =>
      (parsePersonaCriteriaFormJson(criteriaJson) ??
        reviewResult.criteria) as PersonaCriterionFormRow[],
    [criteriaJson, reviewResult.criteria],
  );

  const afterSnapshot = useMemo(
    () =>
      draftFieldsToTextSnapshot({
        definition: formState.definition,
        responsibilities: formState.responsibilities
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        painPoints: formState.painPoints
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        desiredOutcomes: formState.desiredOutcomes
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        messagingNotes: formState.messagingNotes,
      }),
    [formState],
  );

  const applyPlan = useMemo(
    () =>
      buildPersonaResynthesisApplyPlan({
        persona: {
          id: personaId,
          name: personaName,
          manuallyEditedFields,
          targetTitles,
        },
        existingCriteria,
        before: beforeSnapshot,
        after: afterSnapshot,
        proposedCriteria,
      }),
    [
      personaId,
      personaName,
      manuallyEditedFields,
      targetTitles,
      existingCriteria,
      beforeSnapshot,
      afterSnapshot,
      proposedCriteria,
    ],
  );

  if (failed || !draft) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-warning">
          {errorSafe ||
            `${vocab.persona.Singular} rebuild could not be completed. Your current ${vocab.persona.singular} was not changed.`}
        </p>
        <form action={retryAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="productId" value={productId} />
          <input
            type="hidden"
            name="personaSetupRunId"
            value={personaSetupRunId}
          />
          <SecondaryButton type="submit" disabled={retryPending}>
            {retryPending ? "Retrying…" : "Retry rebuild"}
          </SecondaryButton>
          <Link
            href={`/setup/${productId}/personas/manage/${personaId}`}
            className={SECONDARY_BUTTON_CLASS}
          >
            Cancel
          </Link>
        </form>
        {retry ? (
          <p className="text-sm text-danger">{retry.message}</p>
        ) : null}
      </div>
    );
  }

  const compareFields: Array<{
    key: keyof PersonaResynthesisTextSnapshot;
    label: string;
    formKey: keyof typeof formState;
  }> = [
    { key: "definition", label: "Role summary", formKey: "definition" },
    {
      key: "responsibilities",
      label: "Primary responsibilities",
      formKey: "responsibilities",
    },
    { key: "painPoints", label: vocab.painPoint.Plural, formKey: "painPoints" },
    {
      key: "desiredOutcomes",
      label: "Desired outcomes",
      formKey: "desiredOutcomes",
    },
    {
      key: "messagingNotes",
      label: "Messaging notes",
      formKey: "messagingNotes",
    },
  ];

  return (
    <div className="space-y-6" data-testid="persona-resynthesis-review">
      <p className="text-sm text-muted">
        Review the proposed rebuild for <strong>{personaName}</strong>. Confirm
        only replaces the fields listed below — your {vocab.persona.singular} id, {vocab.campaign.plural}, and
        scoring history stay linked. Cancel leaves the {vocab.persona.singular} untouched.
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
        {compareFields.map((field) => (
          <FieldCompare
            key={field.key}
            label={field.label}
            before={beforeSnapshot[field.key]}
            after={formState[field.formKey]}
            name={field.formKey}
            onAfterChange={(value) =>
              setFormState((prev) => ({ ...prev, [field.formKey]: value }))
            }
          />
        ))}
      </div>

      <form action={action} className="space-y-4 border-t border-edge pt-5">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="personaId" value={personaId} />
        <input type="hidden" name="personaSetupRunId" value={personaSetupRunId} />
        <input type="hidden" name="criteriaJson" value={criteriaJson} />
        <input type="hidden" name="department" value={formState.department} />
        <input type="hidden" name="seniority" value={formState.seniority} />
        <input type="hidden" name="definition" value={formState.definition} />
        <input
          type="hidden"
          name="responsibilities"
          value={formState.responsibilities}
        />
        <input type="hidden" name="painPoints" value={formState.painPoints} />
        <input
          type="hidden"
          name="desiredOutcomes"
          value={formState.desiredOutcomes}
        />
        <input
          type="hidden"
          name="messagingNotes"
          value={formState.messagingNotes}
        />

        <div className="flex flex-wrap gap-2">
          <SubmitButton disabled={pending}>
            {pending ? "Applying…" : "Confirm rebuild"}
          </SubmitButton>
          <Link
            href={`/setup/${productId}/personas/manage/${personaId}`}
            className={SECONDARY_BUTTON_CLASS}
          >
            Cancel
          </Link>
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
