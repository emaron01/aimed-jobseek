"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  retryPersonaSynthesisAction,
  saveApprovedPersonaFromRunAction,
  type PersonaSetupActionResult,
} from "@/app/actions/persona-setup";
import { AutosizeTextarea } from "@/components/AutosizeTextarea";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { PersonaBriefingDocument } from "@/components/PersonaBriefingDocument";
import { SECONDARY_BUTTON_CLASS, SecondaryButton, SubmitButton, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { PersonaAiDraft } from "@/lib/persona-research/contract";
import {
  describePersonaSourceLead,
  formatPersonaBriefingMeta,
  groupPersonaCriteriaForBriefing,
  readProvenanceFromProfile,
  resolvePersonaBriefingView,
  type PersonaReviewSource,
} from "@/lib/persona-research/persona-briefing";
import {
  NEEDS_REVIEW_CLASSIFY_TARGETS,
  appendCriterionLineToBox,
  buildPersonaCriteriaForReview,
  criteriaEditorBoxModified,
  criteriaToEditorBoxes,
  editorBoxesToCriteria,
  normalizeCriterionSemanticKey,
  remainingNeedsReviewCriteria,
  parseCriteriaBoxLines,
  researchGuidanceForBox,
  type CriteriaEditorBoxKey,
  type CriteriaEditorBoxes,
  type PersonaCriterionFormRow,
} from "@/lib/persona-research/project-signals";
import { hiringTeamConfig, vocab, vocabExamples } from "@/lib/product-config";

const initial: PersonaSetupActionResult | null = null;

const BOX_META: Array<{
  key: CriteriaEditorBoxKey;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  {
    key: "positiveRoleSignals",
    label: "Positive role signals",
    hint: "One signal per line. Type is fixed for this box.",
    placeholder: "e.g. Owns weekly forecast call",
  },
  {
    key: "exclusions",
    label: "Exclusions (disqualifiers)",
    hint: `One exclusion per line. ${vocab.contact.Plural} matching these are disqualified.`,
    placeholder: "e.g. Pure marketing scope only",
  },
  {
    key: "ownershipAreas",
    label: "Ownership areas",
    hint: "One ownership area per line.",
    placeholder: vocabExamples.personaOwnershipAreaPlaceholder,
  },
  {
    key: "responsibilities",
    label: "Responsibilities / KPIs",
    hint: "One responsibility or KPI per line.",
    placeholder: "e.g. Forecast accuracy",
  },
];

function BoxResearchGuidance({ notes }: { notes: string[] }) {
  const [open, setOpen] = useState(false);
  if (notes.length === 0) return null;

  return (
    <div className="mt-1.5">
      <AppButton
        type="button"
        className="text-xs font-medium text-slate-600 underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open
          ? "Hide research notes"
          : `Research notes (${notes.length})`}
      </AppButton>
      {open ? (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-500">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PersonaCriteriaEditor({
  initialCriteria,
  onChange,
}: {
  initialCriteria: PersonaCriterionFormRow[];
  onChange: (rows: PersonaCriterionFormRow[]) => void;
}) {
  const baseline = useMemo(() => initialCriteria, [initialCriteria]);
  const initialBoxes = useMemo(
    () => criteriaToEditorBoxes(baseline),
    [baseline],
  );
  const [boxes, setBoxes] = useState<CriteriaEditorBoxes>(initialBoxes);
  const [dismissedNeedsReview, setDismissedNeedsReview] = useState<string[]>(
    [],
  );
  const [appliedBaseline, setAppliedBaseline] = useState(baseline);
  if (baseline !== appliedBaseline) {
    setAppliedBaseline(baseline);
    setBoxes(criteriaToEditorBoxes(baseline));
    setDismissedNeedsReview([]);
  }

  useEffect(() => {
    const modifiedBoxes = (
      Object.keys(initialBoxes) as CriteriaEditorBoxKey[]
    ).filter((key) =>
      criteriaEditorBoxModified(initialBoxes[key], boxes[key]),
    );
    onChange(
      editorBoxesToCriteria(boxes, baseline, {
        modifiedBoxes,
        dismissedNeedsReview,
      }),
    );
  }, [boxes, baseline, initialBoxes, dismissedNeedsReview, onChange]);

  function updateBox(key: CriteriaEditorBoxKey, value: string) {
    setBoxes((prev) => ({ ...prev, [key]: value }));
  }

  function classifyNeedsReview(
    name: string,
    box: CriteriaEditorBoxKey,
  ) {
    setBoxes((prev) => ({
      ...prev,
      [box]: appendCriterionLineToBox(prev[box], name),
    }));
  }

  function dismissNeedsReview(name: string) {
    const semantic = normalizeCriterionSemanticKey(name);
    if (!semantic) return;
    setDismissedNeedsReview((prev) =>
      prev.includes(semantic) ? prev : [...prev, semantic],
    );
  }

  const exclusionsEmpty =
    parseCriteriaBoxLines(boxes.exclusions).length === 0;
  const heldForReview = remainingNeedsReviewCriteria(
    baseline,
    boxes,
    dismissedNeedsReview,
  );

  return (
    <div className="md:col-span-2 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          Scoring criteria & role signals
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          One criterion per line in each box. Type and disqualifier role come
          from which box a line is in. Manual edits in a box are preserved on
          later reinterpretation.
        </p>
      </div>
      {heldForReview.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-medium">
            Needs review — unrecognized criterion types (not scored as fit)
          </p>
          <p className="mt-1 text-xs text-amber-900/80">
            Classify each item into a scoring box, or dismiss it. Until then
            it is held out of scoring.
          </p>
          <ul className="mt-2 space-y-2">
            {heldForReview.map((row) => (
              <li
                key={row.name}
                className="rounded border border-amber-200 bg-white px-2 py-2"
                data-testid="needs-review-row"
              >
                <p className="text-xs font-medium text-amber-950">{row.name}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {NEEDS_REVIEW_CLASSIFY_TARGETS.map((target) => (
                    <AppButton
                      key={target.role}
                      type="button"
                      className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-950 hover:bg-amber-100"
                      onClick={() => classifyNeedsReview(row.name, target.box)}
                    >
                      {target.label}
                    </AppButton>
                  ))}
                  <AppButton
                    type="button"
                    className={cn(SECONDARY_BUTTON_CLASS, "py-1", "!px-2", "!py-1", "!text-[11px]")}
                    onClick={() => dismissNeedsReview(row.name)}
                  >
                    Dismiss
                  </AppButton>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="space-y-4">
        {BOX_META.map((meta) => {
          const guidance = researchGuidanceForBox(
            meta.key,
            boxes[meta.key],
            baseline,
          );
          return (
            <div key={meta.key}>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">{meta.label}</span>
                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                  {meta.hint}
                </span>
                <AutosizeTextarea
                  value={boxes[meta.key]}
                  onChange={(e) => updateBox(meta.key, e.target.value)}
                  minRows={3}
                  placeholder={meta.placeholder}
                  className="mt-1 w-full resize-none overflow-hidden rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2"
                />
              </label>
              <BoxResearchGuidance notes={guidance} />
              {meta.key === "exclusions" && exclusionsEmpty ? (
                <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  This {vocab.persona.singular} has no exclusion criteria — no {vocab.contact.singular} will be
                  disqualified.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function draftToFormState(draft: PersonaAiDraft) {
  return {
    name: draft.name,
    likelyTitles: draft.likelyTitles.join(", "),
    department: draft.departmentFunction ?? "",
    seniority: draft.seniority ?? "",
    definition: draft.roleSummary ?? "",
    responsibilities: draft.primaryResponsibilities.join("\n"),
    painPoints: draft.painPoints.join("\n"),
    desiredOutcomes: draft.desiredOutcomesFromSolution.join("\n"),
    messagingNotes: draft.messagingNotes.join("\n"),
  };
}

function DraftEditField({
  label,
  name,
  value,
  onChange,
  required,
  multiline = false,
  hint,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  multiline?: boolean;
  hint?: string;
}) {
  const shared =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2";
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {hint ? (
        <span className="mt-0.5 block text-xs font-normal text-slate-500">
          {hint}
        </span>
      ) : null}
      {multiline ? (
        <AutosizeTextarea
          name={name}
          value={value}
          required={required}
          minRows={3}
          onChange={(event) => onChange(event.target.value)}
          className={`${shared} resize-none overflow-hidden`}
        />
      ) : (
        <input
          name={name}
          value={value}
          required={required}
          onChange={(event) => onChange(event.target.value)}
          className={shared}
        />
      )}
    </label>
  );
}

export function PersonaDraftReview({
  productId,
  personaSetupRunId,
  draft,
  failed,
  errorSafe,
  maxProjectedPersonaCriteria = 15,
  sources = [],
  includesProductEvidence = false,
}: {
  productId: string;
  personaSetupRunId: string;
  draft: PersonaAiDraft | null;
  failed?: boolean;
  errorSafe?: string | null;
  maxProjectedPersonaCriteria?: number;
  sources?: PersonaReviewSource[];
  includesProductEvidence?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    saveApprovedPersonaFromRunAction,
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
            criteria: [],
            droppedCount: 0,
            unmappedCriterionTypes: [],
            missingExclusionCriteria: true,
          },
    [draft, maxProjectedPersonaCriteria],
  );
  const initialCriteria = reviewResult.criteria;
  const [criteriaJson, setCriteriaJson] = useState("[]");
  const [formState, setFormState] = useState({
    name: draft?.name ?? "",
    likelyTitles: draft?.likelyTitles.join(", ") ?? "",
    department: draft?.departmentFunction ?? "",
    seniority: draft?.seniority ?? "",
    definition: draft?.roleSummary ?? "",
    responsibilities: draft?.primaryResponsibilities.join("\n") ?? "",
    painPoints: draft?.painPoints.join("\n") ?? "",
    desiredOutcomes: draft?.desiredOutcomesFromSolution.join("\n") ?? "",
    messagingNotes: draft?.messagingNotes.join("\n") ?? "",
  });

  const handleCriteriaChange = useMemo(
    () => (rows: PersonaCriterionFormRow[]) => {
      setCriteriaJson(JSON.stringify(rows));
    },
    [],
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
      router.push(`/setup/${productId}`);
      router.refresh();
    }
  }, [state, productId, router]);

  useEffect(() => {
    if (retry?.ok && retry.personaSetupRunId) {
      router.push(`/setup/${productId}/personas/${retry.personaSetupRunId}`);
      router.refresh();
    }
  }, [retry, productId, router]);

  const briefing = useMemo(
    () =>
      draft
        ? resolvePersonaBriefingView({
            name: formState.name,
            definition: formState.definition,
            responsibilities: formState.responsibilities,
            painPoints: formState.painPoints,
            desiredOutcomes: formState.desiredOutcomes,
            messagingNotes: formState.messagingNotes,
            targetTitles: formState.likelyTitles,
            department: formState.department,
            seniority: formState.seniority,
            profileJson: draft,
          })
        : null,
    [draft, formState],
  );
  const { evidenceRefs, provenanceAssessments } = useMemo(
    () => readProvenanceFromProfile(draft),
    [draft],
  );
  const criteriaGroups = useMemo(
    () =>
      groupPersonaCriteriaForBriefing(
        JSON.parse(criteriaJson || "[]") as PersonaCriterionFormRow[],
      ),
    [criteriaJson],
  );
  const sourceLead = useMemo(
    () =>
      describePersonaSourceLead({
        personaSources: sources,
        includesProductEvidence,
      }),
    [sources, includesProductEvidence],
  );
  const metaLine = briefing ? formatPersonaBriefingMeta(briefing) : "";

  if (failed || !draft) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-amber-900">
          {errorSafe ||
            `${vocab.persona.Singular} synthesis could not be completed. Research evidence was preserved.`}
        </p>
        <form action={retryAction} className="flex gap-2">
          <input type="hidden" name="productId" value={productId} />
          <input
            type="hidden"
            name="personaSetupRunId"
            value={personaSetupRunId}
          />
          <SecondaryButton type="submit" disabled={retryPending}>
            {retryPending ? "Retrying…" : `Retry ${vocab.persona.Singular} Synthesis`}
          </SecondaryButton>
        </form>
        {retry ? (
          <p className="text-sm text-red-600">{retry.message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-3xl space-y-6"
      data-testid="persona-draft-review"
      data-print-document
    >
      <form action={action} className="space-y-6">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="personaSetupRunId" value={personaSetupRunId} />
        <input type="hidden" name="criteriaJson" value={criteriaJson} />
        {!editing ? (
          <>
            <input type="hidden" name="name" value={formState.name} />
            <input
              type="hidden"
              name="likelyTitles"
              value={formState.likelyTitles}
            />
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
          </>
        ) : null}

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
          <div className="grid gap-4 md:grid-cols-2" data-print-hide>
            <DraftEditField
              label={`${vocab.persona.Singular} Name`}
              name="name"
              required
              value={formState.name}
              onChange={(value) =>
                setFormState((prev) => ({ ...prev, name: value }))
              }
            />
            <DraftEditField
              label="Likely Titles"
              name="likelyTitles"
              value={formState.likelyTitles}
              onChange={(value) =>
                setFormState((prev) => ({ ...prev, likelyTitles: value }))
              }
            />
            <DraftEditField
              label="Function"
              name="department"
              value={formState.department}
              onChange={(value) =>
                setFormState((prev) => ({ ...prev, department: value }))
              }
            />
            <DraftEditField
              label="Seniority"
              name="seniority"
              value={formState.seniority}
              onChange={(value) =>
                setFormState((prev) => ({ ...prev, seniority: value }))
              }
            />
            <div className="md:col-span-2">
              <DraftEditField
                label="Role summary"
                name="definition"
                value={formState.definition}
                onChange={(value) =>
                  setFormState((prev) => ({ ...prev, definition: value }))
                }
                multiline
              />
            </div>
            <div className="md:col-span-2">
              <DraftEditField
                label="Primary Responsibilities"
                name="responsibilities"
                value={formState.responsibilities}
                onChange={(value) =>
                  setFormState((prev) => ({ ...prev, responsibilities: value }))
                }
                multiline
              />
            </div>
            <div className="md:col-span-2">
              <DraftEditField
                label={vocab.painPoint.TitlePlural}
                name="painPoints"
                value={formState.painPoints}
                onChange={(value) =>
                  setFormState((prev) => ({ ...prev, painPoints: value }))
                }
                multiline
              />
            </div>
            <div className="md:col-span-2">
              <DraftEditField
                label={hiringTeamConfig.fields.outcomesLabel}
                name="desiredOutcomes"
                value={formState.desiredOutcomes}
                onChange={(value) =>
                  setFormState((prev) => ({ ...prev, desiredOutcomes: value }))
                }
                multiline
                hint={hiringTeamConfig.fields.outcomesHint}
              />
            </div>
            <div className="md:col-span-2">
              <DraftEditField
                label="Messaging Notes"
                name="messagingNotes"
                value={formState.messagingNotes}
                onChange={(value) =>
                  setFormState((prev) => ({ ...prev, messagingNotes: value }))
                }
                multiline
              />
            </div>
            <PersonaCriteriaEditor
              initialCriteria={initialCriteria}
              onChange={handleCriteriaChange}
            />
            {reviewResult.unmappedCriterionTypes.length > 0 ? (
              <p className="md:col-span-2 text-xs text-slate-500">
                Unrecognized AI criterion types logged for review:{" "}
                {reviewResult.unmappedCriterionTypes.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="border-t border-slate-200 pt-5" data-print-hide>
          <SubmitButton disabled={pending}>
            {pending ? "Saving…" : `Review & Save ${vocab.persona.Singular}`}
          </SubmitButton>
          {state ? (
            <p
              className={
                state.ok
                  ? "mt-3 text-sm text-emerald-700"
                  : "mt-3 text-sm text-red-600"
              }
            >
              {state.message}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
