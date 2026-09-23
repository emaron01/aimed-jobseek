"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Persona } from "@prisma/client";
import { upsertPersonaAction } from "@/app/actions";
import {
  deletePersonaAction,
} from "@/app/actions";
import {
  deletePersonaCriterionAction,
  saveAndInterpretPersonaAction,
  updatePersonaCriterionAction,
} from "@/app/actions/interpretation";
import { projectPersonaSignalsFromProfileAction, rebuildPersonaFromProductEvidenceAction, type PersonaSetupActionResult } from "@/app/actions/persona-setup";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { PersonaBriefingDocument } from "@/components/PersonaBriefingDocument";
import { Field, SECONDARY_BUTTON_CLASS, SecondaryButton, SubmitButton } from "@/components/ui";
import { formatCriterionDisplay } from "@/lib/criteria/types";
import type { PersonaActionResult } from "@/lib/persona/save";
import {
  describePersonaSourceLead,
  formatPersonaBriefingMeta,
  groupPersonaCriteriaForBriefing,
  readProvenanceFromProfile,
  resolvePersonaBriefingView,
  type PersonaReviewSource,
} from "@/lib/persona-research/persona-briefing";
import { NEEDS_REVIEW_CLASSIFY_TARGETS } from "@/lib/persona-research/project-signals";
import { cn, listToCommaString } from "@/lib/utils";
import { vocab, vocabExamples } from "@/lib/product-config";

type CriterionRow = {
  id?: string;
  name: string;
  importance: string;
  isDisqualifier: boolean;
  isRequired: boolean;
  manuallyEdited?: boolean;
  dataType: string;
  operator: string;
  targetValue?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
  sortOrder: number;
  criterionType: string;
  description?: string | null;
};

const initialResult: PersonaActionResult | null = null;

function StatusBanner({ result }: { result: PersonaActionResult | null }) {
  if (!result) return null;
  return (
    <p
      role="status"
      data-testid="persona-action-status"
      className={
        result.ok
          ? "mt-3 text-sm text-emerald-700"
          : "mt-3 text-sm text-red-600"
      }
    >
      {result.message}
    </p>
  );
}

function CriterionActionForm({
  action,
  className,
  children,
}: {
  action: (
    prev: PersonaActionResult | null,
    formData: FormData,
  ) => Promise<PersonaActionResult>;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className={className}>
      {children}
      {pending ? (
        <span className="text-xs text-slate-500">Working…</span>
      ) : null}
      {state ? (
        <p
          role="status"
          className={
            state.ok
              ? "basis-full text-xs text-emerald-700"
              : "basis-full text-xs text-red-600"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function CriteriaReview({
  productId,
  personaId,
  criteria,
}: {
  productId: string;
  personaId: string;
  criteria: CriterionRow[];
}) {
  if (criteria.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate-500">
        No structured criteria yet. Save the {vocab.persona.Singular} definition, then run AI
        Interpretation.
      </p>
    );
  }

  const needsReview = criteria.filter(
    (c) => c.criterionType.trim().toLowerCase() === "needs_review",
  );
  const scored = criteria.filter(
    (c) => c.criterionType.trim().toLowerCase() !== "needs_review",
  );

  return (
    <div className="mt-4 space-y-3">
      {needsReview.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <h5 className="text-sm font-semibold text-amber-950">
            Needs review — {needsReview.length} unclassified
            {needsReview.length === 1 ? " criterion" : " criteria"}
          </h5>
          <p className="mt-1 text-xs text-amber-900/80">
            Classify each item into a scoring box, or dismiss it. Until then
            it is held out of scoring.
          </p>
          <ul className="mt-3 space-y-3 text-sm text-amber-950">
            {needsReview.map((c, i) => (
              <NeedsReviewCriterionRow
                key={c.id ?? `needs-review-${c.name}-${i}`}
                productId={productId}
                personaId={personaId}
                criterion={c}
              />
            ))}
          </ul>
        </div>
      ) : null}
      <div className="rounded-md bg-slate-50 p-3">
      <h5 className="text-sm font-semibold text-slate-900">
        AI Interpretation — review criteria
      </h5>
      <p className="mt-1 text-xs text-slate-500">
        ✓ required / strong · ☆ supporting · ✗ disqualifier. Manual edits are
        preserved on reinterpretation.
      </p>
      {scored.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No scored criteria yet — classify items under Needs review.
        </p>
      ) : null}
      <ul className="mt-3 space-y-3 text-sm text-slate-700">
        {scored.map((c, i) => {
          const role = c.isDisqualifier
            ? "disqualifier"
            : c.isRequired
              ? "required"
              : "supporting";
          return (
            <li
              key={c.id ?? `${c.name}-${i}`}
              className="rounded border border-slate-200 bg-white p-2"
            >
              <div>
                {c.isDisqualifier ? "✗" : c.isRequired ? "✓" : "☆"}{" "}
                {formatCriterionDisplay({
                  ...c,
                  dataType: c.dataType as never,
                  operator: c.operator as never,
                  importance: c.importance as never,
                })}
                {c.manuallyEdited ? (
                  <span className="ml-2 text-xs text-amber-700">(manual)</span>
                ) : null}
              </div>
              {c.id ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <CriterionActionForm
                    action={updatePersonaCriterionAction}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="criterionId" value={c.id} />
                    <input type="hidden" name="personaId" value={personaId} />
                    <input type="hidden" name="productId" value={productId} />
                    <input type="hidden" name="name" value={c.name} />
                    <label className="text-xs text-slate-600">
                      Role
                      <select
                        name="role"
                        defaultValue={role}
                        className="ml-1 rounded border border-slate-300 px-1 py-0.5 text-xs"
                      >
                        <option value="required">Required / strong</option>
                        <option value="supporting">Supporting</option>
                        <option value="disqualifier">Disqualifier</option>
                      </select>
                    </label>
                    <SecondaryButton type="submit">Update</SecondaryButton>
                  </CriterionActionForm>
                  <CriterionActionForm action={deletePersonaCriterionAction}>
                    <input type="hidden" name="criterionId" value={c.id} />
                    <input type="hidden" name="personaId" value={personaId} />
                    <input type="hidden" name="productId" value={productId} />
                    <SecondaryButton type="submit">Remove</SecondaryButton>
                  </CriterionActionForm>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      </div>
    </div>
  );
}

function NeedsReviewCriterionRow({
  productId,
  personaId,
  criterion,
}: {
  productId: string;
  personaId: string;
  criterion: CriterionRow;
}) {
  return (
    <li className="rounded border border-amber-200 bg-white p-2">
      <div>
        <span className="font-medium">{criterion.name}</span>
        <span className="ml-2 text-xs text-amber-800/80">needs_review</span>
      </div>
      {criterion.id ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <CriterionActionForm
            action={updatePersonaCriterionAction}
            className="flex flex-wrap items-center gap-1.5"
          >
            <input type="hidden" name="criterionId" value={criterion.id} />
            <input type="hidden" name="personaId" value={personaId} />
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="name" value={criterion.name} />
            {NEEDS_REVIEW_CLASSIFY_TARGETS.map((target) => (
              <button
                key={target.role}
                type="submit"
                name="role"
                value={target.role}
                className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-950 hover:bg-amber-100"
              >
                {target.label}
              </button>
            ))}
          </CriterionActionForm>
          <CriterionActionForm action={deletePersonaCriterionAction}>
            <input type="hidden" name="criterionId" value={criterion.id} />
            <input type="hidden" name="personaId" value={personaId} />
            <input type="hidden" name="productId" value={productId} />
            <button
              type="submit"
              className={cn(SECONDARY_BUTTON_CLASS, "py-1", "!px-2", "!py-1", "!text-[11px]")}
            >
              Dismiss
            </button>
          </CriterionActionForm>
        </div>
      ) : null}
    </li>
  );
}

function PersonaHiddenFields({ persona }: { persona: Persona }) {
  return (
    <>
      <input type="hidden" name="id" value={persona.id} />
      <input type="hidden" name="name" value={persona.name} />
      <input
        type="hidden"
        name="targetTitles"
        value={listToCommaString(persona.targetTitles)}
      />
      <input
        type="hidden"
        name="definition"
        value={persona.definition ?? persona.responsibilities ?? ""}
      />
      <input
        type="hidden"
        name="additionalContext"
        value={persona.additionalContext ?? ""}
      />
      <input type="hidden" name="department" value={persona.department ?? ""} />
      <input type="hidden" name="seniority" value={persona.seniority ?? ""} />
      <input
        type="hidden"
        name="responsibilities"
        value={persona.responsibilities ?? ""}
      />
      <input type="hidden" name="painPoints" value={persona.painPoints ?? ""} />
      <input
        type="hidden"
        name="desiredOutcomes"
        value={persona.desiredOutcomes ?? ""}
      />
      <input
        type="hidden"
        name="messagingNotes"
        value={persona.messagingNotes ?? ""}
      />
    </>
  );
}

function NewPersonaForm({
  productId,
}: {
  productId: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [saveState, saveAction, savePending] = useActionState(
    upsertPersonaAction,
    initialResult,
  );
  const [interpretState, interpretAction, interpretPending] = useActionState(
    saveAndInterpretPersonaAction,
    initialResult,
  );

  const status = interpretState ?? saveState;
  const pending = savePending || interpretPending;

  useEffect(() => {
    if (saveState?.ok && saveState.personaId) {
      router.refresh();
    }
    if (interpretState?.ok) {
      router.refresh();
    }
  }, [saveState, interpretState, router]);

  return (
    <div
      className="rounded-md border border-slate-200 p-4"
      data-testid="persona-form"
    >
      <p className="mb-3 text-xs text-slate-500">
        Workflow: {vocab.persona.Singular} definition → Save → AI Interpretation → Review
        criteria. AI is optional for saving.
      </p>
      <form
        ref={formRef}
        action={saveAction}
        className="grid gap-4 md:grid-cols-2"
      >
        <input type="hidden" name="id" value="" />
        <input type="hidden" name="productId" value={productId} />
        <Field label={`${vocab.persona.Singular} Name`} name="name" required />
        <Field
          label="Likely Titles (evidence)"
          name="targetTitles"
          placeholder={vocabExamples.personaLikelyTitlesPlaceholder}
          hint={vocabExamples.personaLikelyTitlesHint}
        />
        <div className="md:col-span-2">
          <Field
            label="Describe the person who buys / cares"
            name="definition"
            as="textarea"
            placeholder="The executive responsible for…"
            hint={`Authoritative ${vocab.buyer.singular} narrative. Preserved as source data.`}
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Additional context (optional)"
            name="additionalContext"
            as="textarea"
          />
        </div>
        <Field
          label="Department / Function"
          name="department"
          placeholder={vocabExamples.personaDepartmentPlaceholder}
          hint={vocabExamples.personaDepartmentHint}
        />
        <Field
          label="Seniority"
          name="seniority"
          placeholder="Director through C-Suite"
          hint="Organizational level — distinct from title and function."
        />
        <div className="md:col-span-2">
          <Field
            label="Primary Responsibilities"
            name="responsibilities"
            as="textarea"
            hint="What they own, manage, decide, or are accountable for."
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label={`Problems / ${vocab.painPoint.TitlePlural}`}
            name="painPoints"
            as="textarea"
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label={`Desired Outcomes From Your ${vocab.solution.Singular}`}
            name="desiredOutcomes"
            as="textarea"
            hint={`What does this person want to improve, achieve, reduce, or avoid by using ${vocab.solution.aSingular} like yours? Not ${vocab.campaign.aSingular} CTA (meeting, ${vocab.demo.singular}, reply).`}
            placeholder="Reduce forecast administration time; improve forecast confidence…"
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Messaging Notes"
            name="messagingNotes"
            as="textarea"
            hint="Communication guidance only — not automatic scoring criteria."
          />
        </div>
        <div className="md:col-span-2 flex flex-wrap items-center gap-2">
          <SubmitButton disabled={pending}>
            {savePending ? "Saving…" : `Add ${vocab.persona.singular}`}
          </SubmitButton>
          <button
            type="submit"
            formAction={interpretAction}
            disabled={pending}
            className={SECONDARY_BUTTON_CLASS}
          >
            {interpretPending
              ? "Regenerating criteria…"
              : "Regenerate criteria"}
          </button>
        </div>
      </form>
      <StatusBanner result={status} />
    </div>
  );
}

export function PersonaForm({
  productId,
  persona,
  criteria,
  sources = [],
  includesProductEvidence = false,
}: {
  productId: string;
  persona?: Persona;
  criteria: CriterionRow[];
  sources?: PersonaReviewSource[];
  includesProductEvidence?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState(false);
  const [saveState, saveAction, savePending] = useActionState(
    upsertPersonaAction,
    initialResult,
  );
  const [interpretState, interpretAction, interpretPending] = useActionState(
    saveAndInterpretPersonaAction,
    initialResult,
  );
  const [projectState, projectAction, projectPending] = useActionState(
    projectPersonaSignalsFromProfileAction,
    initialResult,
  );
  const [rebuildState, rebuildAction, rebuildPending] = useActionState(
    rebuildPersonaFromProductEvidenceAction,
    null as PersonaSetupActionResult | null,
  );

  const status = interpretState ?? saveState ?? projectState ?? rebuildState;
  const pending = savePending || interpretPending || projectPending || rebuildPending;

  const briefing = useMemo(
    () =>
      persona
        ? resolvePersonaBriefingView({
            name: persona.name,
            definition: persona.definition,
            responsibilities: persona.responsibilities,
            painPoints: persona.painPoints,
            desiredOutcomes: persona.desiredOutcomes,
            messagingNotes: persona.messagingNotes,
            targetTitles: persona.targetTitles,
            department: persona.department,
            seniority: persona.seniority,
            profileJson: persona.profileJson,
          })
        : null,
    [persona],
  );
  const { evidenceRefs, provenanceAssessments } = useMemo(
    () => readProvenanceFromProfile(persona?.profileJson),
    [persona?.profileJson],
  );
  const criteriaGroups = useMemo(
    () => groupPersonaCriteriaForBriefing(criteria),
    [criteria],
  );
  const sourceLead = useMemo(
    () =>
      describePersonaSourceLead({
        personaSources: sources,
        includesProductEvidence,
        manualOnly:
          !persona?.approvedPersonaSetupRunId && sources.length === 0,
      }),
    [sources, includesProductEvidence, persona?.approvedPersonaSetupRunId],
  );
  const metaLine = briefing ? formatPersonaBriefingMeta(briefing) : "";

  useEffect(() => {
    if (saveState?.ok) {
      setEditing(false);
      router.refresh();
    }
    if (interpretState?.ok) {
      router.refresh();
    }
    if (projectState?.ok) {
      router.refresh();
    }
    if (
      rebuildState?.ok &&
      rebuildState.personaSetupRunId &&
      rebuildState.personaId
    ) {
      router.push(
        `/setup/${productId}/personas/manage/${rebuildState.personaId}/rebuild/${rebuildState.personaSetupRunId}`,
      );
      router.refresh();
    }
  }, [saveState, interpretState, projectState, rebuildState, productId, router]);

  if (!persona) {
    return <NewPersonaForm productId={productId} />;
  }

  return (
    <div
      className="mx-auto max-w-3xl space-y-6"
      data-testid="persona-briefing"
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

      {!editing && briefing ? (
        <PersonaBriefingDocument
          briefing={briefing}
          sourceLead={sourceLead.sentence}
          sourceNames={sourceLead.names}
          metaLine={metaLine}
          evidenceRefs={evidenceRefs}
          provenanceAssessments={provenanceAssessments}
          sources={sources}
          criteriaGroups={criteriaGroups}
        />
      ) : null}

      {editing ? (
        <div
          className="rounded-md border border-slate-200 p-4"
          data-print-hide
          data-testid="persona-form"
        >
          <p className="mb-3 text-xs text-slate-500">
            Workflow: {vocab.persona.Singular} definition → Save → AI Interpretation → Review
            criteria. AI is optional for saving.
          </p>
          <form
            ref={formRef}
            action={saveAction}
            className="grid gap-4 md:grid-cols-2"
          >
            <input type="hidden" name="id" value={persona.id} />
            <input type="hidden" name="productId" value={productId} />
            <Field
              label={`${vocab.persona.Singular} Name`}
              name="name"
              defaultValue={persona.name}
              required
            />
            <Field
              label="Likely Titles (evidence)"
              name="targetTitles"
              defaultValue={listToCommaString(persona.targetTitles)}
              placeholder={vocabExamples.personaLikelyTitlesPlaceholder}
              hint={vocabExamples.personaLikelyTitlesHint}
            />
            <div className="md:col-span-2">
              <Field
                label="Describe the person who buys / cares"
                name="definition"
                defaultValue={persona.definition ?? persona.responsibilities}
                as="textarea"
                placeholder="The executive responsible for…"
                hint={`Authoritative ${vocab.buyer.singular} narrative. Preserved as source data.`}
              />
            </div>
            <div className="md:col-span-2">
              <Field
                label="Additional context (optional)"
                name="additionalContext"
                defaultValue={persona.additionalContext}
                as="textarea"
              />
            </div>
            <Field
              label="Department / Function"
              name="department"
              defaultValue={persona.department}
              placeholder={vocabExamples.personaDepartmentPlaceholder}
              hint={vocabExamples.personaDepartmentHint}
            />
            <Field
              label="Seniority"
              name="seniority"
              defaultValue={persona.seniority}
              placeholder="Director through C-Suite"
              hint="Organizational level — distinct from title and function."
            />
            <div className="md:col-span-2">
              <Field
                label="Primary Responsibilities"
                name="responsibilities"
                defaultValue={persona.responsibilities}
                as="textarea"
                hint="What they own, manage, decide, or are accountable for."
              />
            </div>
            <div className="md:col-span-2">
              <Field
                label={`Problems / ${vocab.painPoint.TitlePlural}`}
                name="painPoints"
                defaultValue={persona.painPoints}
                as="textarea"
              />
            </div>
            <div className="md:col-span-2">
              <Field
                label={`Desired Outcomes From Your ${vocab.solution.Singular}`}
                name="desiredOutcomes"
                defaultValue={persona.desiredOutcomes}
                as="textarea"
                hint={`What does this person want to improve, achieve, reduce, or avoid by using ${vocab.solution.aSingular} like yours? Not ${vocab.campaign.aSingular} CTA (meeting, ${vocab.demo.singular}, reply).`}
                placeholder="Reduce forecast administration time; improve forecast confidence…"
              />
            </div>
            <div className="md:col-span-2">
              <Field
                label="Messaging Notes"
                name="messagingNotes"
                defaultValue={persona.messagingNotes}
                as="textarea"
                hint="Communication guidance only — not automatic scoring criteria."
              />
            </div>
            <div className="md:col-span-2 flex flex-wrap items-center gap-2">
              <SubmitButton disabled={pending}>
                {savePending ? "Saving…" : `Save ${vocab.persona.singular}`}
              </SubmitButton>
              <button
                type="submit"
                formAction={interpretAction}
                disabled={pending}
                className={SECONDARY_BUTTON_CLASS}
              >
                {interpretPending
                  ? "Regenerating criteria…"
                  : "Regenerate criteria"}
              </button>
            </div>
          </form>
          <StatusBanner result={status} />
          <CriteriaReview
            productId={productId}
            personaId={persona.id}
            criteria={criteria}
          />
        </div>
      ) : null}

      <div className="space-y-3 border-t border-slate-200 pt-4" data-print-hide>
        {!editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <form action={interpretAction} className="inline">
              <input type="hidden" name="productId" value={productId} />
              <PersonaHiddenFields persona={persona} />
              <button
                type="submit"
                disabled={interpretPending}
                className={SECONDARY_BUTTON_CLASS}
              >
                {interpretPending
                  ? "Regenerating criteria…"
                  : "Regenerate criteria"}
              </button>
            </form>
            {persona.approvalStatus === "APPROVED" ? (
              <form action={rebuildAction} className="inline">
                <input type="hidden" name="productId" value={productId} />
                <input type="hidden" name="personaId" value={persona.id} />
                <button
                  type="submit"
                  disabled={rebuildPending}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  {rebuildPending
                    ? "Rebuilding…"
                    : `Rebuild from ${vocab.product.singular} evidence`}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
        {!editing ? (
          <p className="text-xs text-slate-500">
            Regenerate criteria updates scoring criteria from the text fields
            above. Rebuild from {vocab.product.singular} evidence re-synthesizes role summary,
            pains, outcomes, and messaging from stored {vocab.product.singular} research (review
            before anything changes).
          </p>
        ) : null}
        {!editing && interpretState ? (
          <StatusBanner result={interpretState} />
        ) : null}
        {!editing && rebuildState ? (
          <StatusBanner result={rebuildState} />
        ) : null}
        {persona.profileJson ? (
          <form action={projectAction}>
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="personaId" value={persona.id} />
            <SecondaryButton type="submit" disabled={projectPending}>
              {projectPending
                ? "Projecting…"
                : "Project role signals from profile"}
            </SecondaryButton>
            <p className="mt-1 text-xs text-slate-500">
              Adds criteria from stored AI role signals (ownership, KPIs,
              positive/negative signals) without rewriting existing rows.
            </p>
          </form>
        ) : null}
        {projectState && !editing ? (
          <StatusBanner result={projectState} />
        ) : null}
        <ConfirmDeleteForm
          action={deletePersonaAction}
          hiddenFields={{
            id: persona.id,
            productId,
          }}
          triggerLabel={`Delete ${vocab.persona.singular}`}
          confirmTitle={`Delete ${vocab.persona.Singular} "${persona.name}"?`}
          confirmBody={`This will remove this ${vocab.persona.Singular} and its current generated criteria.\nHistorical scoring snapshots will not be changed.\nIf scoring runs reference this ${vocab.persona.Singular}, it will be archived instead of permanently deleted.`}
          confirmButtonLabel={`Delete ${vocab.persona.Singular}`}
          onSuccessNavigate={`/setup/${productId}`}
        />
      </div>
    </div>
  );
}
