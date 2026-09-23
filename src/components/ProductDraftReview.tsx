"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  saveApprovedProductAction,
  type ProductSetupActionResult,
} from "@/app/actions/product-setup";
import { AutosizeTextarea } from "@/components/AutosizeTextarea";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { SourceMarkers } from "@/components/research-document";
import { SECONDARY_CHIP_CLASS, SecondaryButton, SubmitButton } from "@/components/ui";
import type {
  ProductDraft,
  ProductMessagingDraft,
} from "@/lib/product-research/contract";
import {
  PRODUCT_DRAFT_FIELD_HINTS,
  PRODUCT_DRAFT_FIELD_LABELS,
  describeProductSourceLead,
  emptyProductDraft,
  evidenceRefsForText,
  sourceLabelForId,
  stringifyDraftList,
  type ProductDraftEvidenceRef,
  type ProductDraftListField,
  type ProductDraftStringField,
  type ProductReviewSource,
} from "@/lib/product-research/review";
import {
  buildSourceIndex,
  sourceMarkerNumbers,
} from "@/lib/research/source-index";
import { vocab } from "@/lib/product-config";

const initialResult: ProductSetupActionResult | null = null;

function normalizeDraft(draft: ProductDraft): ProductDraft {
  return {
    ...emptyProductDraft(),
    ...draft,
    problemsSolved: draft.problemsSolved ?? [],
    capabilities: draft.capabilities ?? [],
    differentiators: draft.differentiators ?? [],
    primaryUseCases: draft.primaryUseCases ?? [],
    relevantBuyerFunctions: draft.relevantBuyerFunctions ?? [],
    relevantIndustries: draft.relevantIndustries ?? [],
    businessOutcomes: draft.businessOutcomes ?? [],
    proofPoints: draft.proofPoints ?? [],
    customerEvidence: draft.customerEvidence ?? [],
    terminology: draft.terminology ?? [],
    unknownFields: draft.unknownFields ?? [],
    evidenceRefs: draft.evidenceRefs ?? [],
  };
}

function Status({ result }: { result: ProductSetupActionResult | null }) {
  if (!result) return null;
  return (
    <p
      role="status"
      data-testid="product-draft-review-status"
      className={
        result.ok ? "mt-3 text-sm text-emerald-700" : "mt-3 text-sm text-red-600"
      }
    >
      {result.message}
    </p>
  );
}

function EvidenceChip({
  refs,
  sources,
  sourceIndex,
}: {
  refs: ProductDraftEvidenceRef[];
  sources: ProductReviewSource[];
  sourceIndex: Map<string, number>;
}) {
  const [open, setOpen] = useState(false);
  if (refs.length === 0) return null;
  const first = refs[0]!;
  const label =
    first.sourceIds
      .map((id) => sourceLabelForId(id, sources))
      .filter((name) => name !== "Source")[0] ?? "Source";
  const markers = sourceMarkerNumbers(
    [...new Set(refs.flatMap((ref) => ref.sourceIds))],
    sourceIndex,
  );

  return (
    <span className="research-source-chip relative ml-1 inline-block align-middle">
      <button
        type="button"
        data-print-hide
        className={SECONDARY_CHIP_CLASS}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        {refs.length > 1 ? ` +${refs.length - 1}` : ""}
      </button>
      <span className="research-source-chip-print hidden rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 print:inline">
        {label}
        {refs.length > 1 ? ` +${refs.length - 1}` : ""}
      </span>
      {open ? (
        <span className="research-source-chip-popup absolute left-0 z-10 mt-1 w-72 rounded-md border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-sm print:hidden">
          {refs.map((ref, index) => (
            <span key={`${ref.claim}-${index}`} className="block">
              {index > 0 ? <span className="my-2 block border-t border-slate-100" /> : null}
              <span className="block text-slate-900">{ref.claim}</span>
              <span className="mt-1 block text-slate-500">
                {ref.sourceIds.length > 0
                  ? ref.sourceIds
                      .map((id) => sourceLabelForId(id, sources))
                      .join(" · ")
                  : "Source not named"}
              </span>
              {ref.note ? (
                <span className="mt-1 block text-slate-500">{ref.note}</span>
              ) : null}
            </span>
          ))}
        </span>
      ) : null}
      <SourceMarkers numbers={markers} />
    </span>
  );
}

function ReadItem({
  text,
  refs,
  sources,
  sourceIndex,
}: {
  text: string;
  refs: ProductDraftEvidenceRef[];
  sources: ProductReviewSource[];
  sourceIndex: Map<string, number>;
}) {
  const matched = evidenceRefsForText(text, refs);
  return (
    <li className="leading-relaxed text-slate-800">
      {text}
      <EvidenceChip refs={matched} sources={sources} sourceIndex={sourceIndex} />
    </li>
  );
}

function ReadSection({
  title,
  children,
  empty,
}: {
  title: string;
  children: ReactNode;
  empty: boolean;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </h3>
      {empty ? (
        <p className="text-sm text-slate-500">None recorded from the material.</p>
      ) : (
        children
      )}
    </section>
  );
}

function EditField({
  label,
  name,
  hint,
  value,
  onChange,
  minRows = 3,
  singleLine = false,
}: {
  label: string;
  name: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  minRows?: number;
  singleLine?: boolean;
}) {
  const shared =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2";
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-800">{label}</span>
      <span className="mt-0.5 block text-xs font-normal text-slate-500">
        {hint}
      </span>
      {singleLine ? (
        <input
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={shared}
        />
      ) : (
        <AutosizeTextarea
          name={name}
          value={value}
          minRows={minRows}
          onChange={(event) => onChange(event.target.value)}
          className={`${shared} resize-none overflow-hidden`}
        />
      )}
    </label>
  );
}

export function ProductDraftReview({
  productId,
  setupRunId,
  productName,
  websiteUrl,
  sources,
  draft,
  messaging,
}: {
  productId: string;
  setupRunId: string;
  productName: string;
  websiteUrl: string | null;
  sources: ProductReviewSource[];
  draft: ProductDraft;
  messaging: ProductMessagingDraft | null;
}) {
  const [state, action, pending] = useActionState(
    saveApprovedProductAction,
    initialResult,
  );
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(productName);
  const [url, setUrl] = useState(websiteUrl ?? "");
  const [profile, setProfile] = useState<ProductDraft>(() =>
    normalizeDraft(draft),
  );

  useEffect(() => {
    setName(productName);
    setUrl(websiteUrl ?? "");
    setProfile(normalizeDraft(draft));
  }, [draft, productName, websiteUrl]);

  useEffect(() => {
    if (state?.ok) {
      setEditing(false);
      router.refresh();
    }
  }, [state, router]);

  const sourceLead = useMemo(
    () => describeProductSourceLead({ sources, draft: profile }),
    [sources, profile],
  );
  const refs = profile.evidenceRefs ?? [];
  const sourceIndex = useMemo(
    () => buildSourceIndex(sources, (source) => source.id),
    [sources],
  );
  const unknownLabels = (profile.unknownFields ?? []).map(
    (key) => PRODUCT_DRAFT_FIELD_LABELS[key] ?? key,
  );

  function setString(field: ProductDraftStringField, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }

  function setList(field: ProductDraftListField, value: string) {
    setProfile((prev) => ({
      ...prev,
      [field]: value.split(/\r?\n/),
    }));
  }

  function listValue(field: ProductDraftListField): string {
    return stringifyDraftList(profile[field]);
  }

  const hiddenWhenEditing = !editing;

  return (
    <div
      className="mx-auto max-w-3xl space-y-6"
      data-testid="product-draft-review"
      data-print-document
    >
      <div>
        <p
          className={
            sourceLead.kind === "failed_read"
              ? "text-base text-amber-950"
              : "text-base text-slate-800"
          }
          data-testid="product-source-lead"
        >
          {sourceLead.sentence}
        </p>
        {sourceLead.detail ? (
          <p className="mt-2 text-sm text-amber-900" data-testid="product-source-detail">
            {sourceLead.detail}
          </p>
        ) : null}
        {sourceLead.names.length > 0 ? (
          <p className="mt-1 text-sm text-slate-500">
            {sourceLead.names.join(" · ")}
          </p>
        ) : null}
      </div>

      <form action={action} className="space-y-8">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="setupRunId" value={setupRunId} />
        <input
          type="hidden"
          name="evidenceRefsJson"
          value={JSON.stringify(refs)}
        />
        {hiddenWhenEditing ? (
          <>
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="websiteUrl" value={url} />
            <input
              type="hidden"
              name="description"
              value={profile.description ?? ""}
            />
            <input
              type="hidden"
              name="valueProposition"
              value={profile.valueProposition ?? ""}
            />
            <input
              type="hidden"
              name="pricingAovContext"
              value={profile.pricingAovContext ?? ""}
            />
            <input
              type="hidden"
              name="deploymentContext"
              value={profile.deploymentContext ?? ""}
            />
            {(
              [
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
              ] as ProductDraftListField[]
            ).map((field) => (
              <input
                key={field}
                type="hidden"
                name={field}
                value={stringifyDraftList(profile[field])}
              />
            ))}
          </>
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">
              {editing ? (
                <span className="sr-only">Edit {vocab.product.singular} profile</span>
              ) : (
                name
              )}
            </h3>
            {!editing && url ? (
              <p className="mt-1 text-sm text-slate-500">{url}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2" data-print-hide>
            <ExportPdfButton />
            <SecondaryButton
              type="button"
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? "Done editing" : "Edit"}
            </SecondaryButton>
          </div>
        </div>

        {editing ? (
          <div className="space-y-5">
            <EditField
              label={`${vocab.product.Singular} name`}
              name="name"
              hint={PRODUCT_DRAFT_FIELD_HINTS.name}
              value={name}
              onChange={setName}
              singleLine
            />
            <EditField
              label="Website URL"
              name="websiteUrl"
              hint={PRODUCT_DRAFT_FIELD_HINTS.websiteUrl}
              value={url}
              onChange={setUrl}
              singleLine
            />
            <EditField
              label="What it is"
              name="description"
              hint={PRODUCT_DRAFT_FIELD_HINTS.description}
              value={profile.description ?? ""}
              onChange={(value) => setString("description", value)}
              minRows={4}
            />
            <EditField
              label={vocab.valueProposition.Singular}
              name="valueProposition"
              hint={PRODUCT_DRAFT_FIELD_HINTS.valueProposition}
              value={profile.valueProposition ?? ""}
              onChange={(value) => setString("valueProposition", value)}
            />
            <EditField
              label="Problems it solves"
              name="problemsSolved"
              hint={PRODUCT_DRAFT_FIELD_HINTS.problemsSolved}
              value={listValue("problemsSolved")}
              onChange={(value) => setList("problemsSolved", value)}
            />
            <EditField
              label="What it does"
              name="capabilities"
              hint={PRODUCT_DRAFT_FIELD_HINTS.capabilities}
              value={listValue("capabilities")}
              onChange={(value) => setList("capabilities", value)}
            />
            <EditField
              label="What makes it different"
              name="differentiators"
              hint={PRODUCT_DRAFT_FIELD_HINTS.differentiators}
              value={listValue("differentiators")}
              onChange={(value) => setList("differentiators", value)}
            />
            <EditField
              label={`Who it's for — ${vocab.buyer.singular} functions`}
              name="relevantBuyerFunctions"
              hint={PRODUCT_DRAFT_FIELD_HINTS.relevantBuyerFunctions}
              value={listValue("relevantBuyerFunctions")}
              onChange={(value) => setList("relevantBuyerFunctions", value)}
            />
            <EditField
              label="Who it's for — industries"
              name="relevantIndustries"
              hint={PRODUCT_DRAFT_FIELD_HINTS.relevantIndustries}
              value={listValue("relevantIndustries")}
              onChange={(value) => setList("relevantIndustries", value)}
            />
            <EditField
              label="How it's used"
              name="primaryUseCases"
              hint={PRODUCT_DRAFT_FIELD_HINTS.primaryUseCases}
              value={listValue("primaryUseCases")}
              onChange={(value) => setList("primaryUseCases", value)}
            />
            <EditField
              label="Business outcomes"
              name="businessOutcomes"
              hint={PRODUCT_DRAFT_FIELD_HINTS.businessOutcomes}
              value={listValue("businessOutcomes")}
              onChange={(value) => setList("businessOutcomes", value)}
            />
            <EditField
              label="How it's sold"
              name="deploymentContext"
              hint={PRODUCT_DRAFT_FIELD_HINTS.deploymentContext}
              value={profile.deploymentContext ?? ""}
              onChange={(value) => setString("deploymentContext", value)}
            />
            <EditField
              label={`Pricing / ${vocab.deal.singular} context`}
              name="pricingAovContext"
              hint={PRODUCT_DRAFT_FIELD_HINTS.pricingAovContext}
              value={profile.pricingAovContext ?? ""}
              onChange={(value) => setString("pricingAovContext", value)}
            />
            <EditField
              label="Language"
              name="terminology"
              hint={PRODUCT_DRAFT_FIELD_HINTS.terminology}
              value={listValue("terminology")}
              onChange={(value) => setList("terminology", value)}
            />
            <EditField
              label="Proof points"
              name="proofPoints"
              hint={PRODUCT_DRAFT_FIELD_HINTS.proofPoints}
              value={listValue("proofPoints")}
              onChange={(value) => setList("proofPoints", value)}
            />
            <EditField
              label={`${vocab.customer.Singular} evidence`}
              name="customerEvidence"
              hint={PRODUCT_DRAFT_FIELD_HINTS.customerEvidence}
              value={listValue("customerEvidence")}
              onChange={(value) => setList("customerEvidence", value)}
            />
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-800">Evidence</p>
              <p className="text-xs text-slate-500">
                {PRODUCT_DRAFT_FIELD_HINTS.evidenceRefs}
              </p>
              {refs.map((ref, index) => (
                <div
                  key={`ref-${index}`}
                  className="space-y-2 rounded-md border border-slate-200 p-3"
                >
                  <AutosizeTextarea
                    value={ref.claim}
                    minRows={2}
                    onChange={(event) => {
                      const next = [...refs];
                      next[index] = { ...ref, claim: event.target.value };
                      setProfile((prev) => ({ ...prev, evidenceRefs: next }));
                    }}
                    className="w-full resize-none overflow-hidden rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    value={ref.sourceIds.join(", ")}
                    placeholder="Source ids, comma-separated"
                    onChange={(event) => {
                      const next = [...refs];
                      next[index] = {
                        ...ref,
                        sourceIds: event.target.value
                          .split(",")
                          .map((id) => id.trim())
                          .filter(Boolean),
                      };
                      setProfile((prev) => ({ ...prev, evidenceRefs: next }));
                    }}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    value={ref.note ?? ""}
                    placeholder="Optional note"
                    onChange={(event) => {
                      const next = [...refs];
                      next[index] = {
                        ...ref,
                        note: event.target.value || null,
                      };
                      setProfile((prev) => ({ ...prev, evidenceRefs: next }));
                    }}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              ))}
              <SecondaryButton
                type="button"
                onClick={() =>
                  setProfile((prev) => ({
                    ...prev,
                    evidenceRefs: [
                      ...(prev.evidenceRefs ?? []),
                      { claim: "", sourceIds: [], note: null },
                    ],
                  }))
                }
              >
                Add evidence claim
              </SecondaryButton>
            </div>
            <EditField
              label="Fields left unknown"
              name="unknownFields"
              hint={PRODUCT_DRAFT_FIELD_HINTS.unknownFields}
              value={listValue("unknownFields")}
              onChange={(value) => setList("unknownFields", value)}
              minRows={2}
            />
          </div>
        ) : (
          <article className="space-y-8">
            <ReadSection
              title="What it is"
              empty={!profile.description && !profile.valueProposition}
            >
              {profile.description ? (
                <p className="text-[17px] leading-7 text-slate-800">
                  {profile.description}
                  <EvidenceChip
                    refs={evidenceRefsForText(profile.description, refs)}
                    sources={sources}
                    sourceIndex={sourceIndex}
                  />
                </p>
              ) : null}
              {profile.valueProposition ? (
                <p className="text-[17px] leading-7 text-slate-800">
                  {profile.valueProposition}
                  <EvidenceChip
                    refs={evidenceRefsForText(profile.valueProposition, refs)}
                    sources={sources}
                    sourceIndex={sourceIndex}
                  />
                </p>
              ) : null}
            </ReadSection>

            <ReadSection
              title="Problems it solves"
              empty={(profile.problemsSolved ?? []).length === 0}
            >
              <ul className="list-disc space-y-2 pl-5 text-[17px]">
                {(profile.problemsSolved ?? []).map((item) => (
                  <ReadItem key={item} text={item} refs={refs} sources={sources} sourceIndex={sourceIndex} />
                ))}
              </ul>
            </ReadSection>

            <ReadSection
              title="What it does"
              empty={(profile.capabilities ?? []).length === 0}
            >
              <ul className="list-disc space-y-2 pl-5 text-[17px]">
                {(profile.capabilities ?? []).map((item) => (
                  <ReadItem key={item} text={item} refs={refs} sources={sources} sourceIndex={sourceIndex} />
                ))}
              </ul>
            </ReadSection>

            <ReadSection
              title="What makes it different"
              empty={(profile.differentiators ?? []).length === 0}
            >
              <ul className="list-disc space-y-2 pl-5 text-[17px]">
                {(profile.differentiators ?? []).map((item) => (
                  <ReadItem key={item} text={item} refs={refs} sources={sources} sourceIndex={sourceIndex} />
                ))}
              </ul>
            </ReadSection>

            <ReadSection
              title="Who it's for"
              empty={
                (profile.relevantBuyerFunctions ?? []).length === 0 &&
                (profile.relevantIndustries ?? []).length === 0
              }
            >
              {(profile.relevantBuyerFunctions ?? []).length > 0 ? (
                <div>
                  <p className="text-sm font-medium text-slate-600">
                    {vocab.buyer.Singular} functions
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px]">
                    {(profile.relevantBuyerFunctions ?? []).map((item) => (
                      <ReadItem
                        key={item}
                        text={item}
                        refs={refs}
                        sources={sources}
                        sourceIndex={sourceIndex}
                      />
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  {vocab.buyer.Singular} functions: none recorded from the material.
                </p>
              )}
              {(profile.relevantIndustries ?? []).length > 0 ? (
                <div>
                  <p className="text-sm font-medium text-slate-600">Industries</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px]">
                    {(profile.relevantIndustries ?? []).map((item) => (
                      <ReadItem
                        key={item}
                        text={item}
                        refs={refs}
                        sources={sources}
                        sourceIndex={sourceIndex}
                      />
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Industries: none recorded from the material.
                </p>
              )}
            </ReadSection>

            <ReadSection
              title="How it's used"
              empty={
                (profile.primaryUseCases ?? []).length === 0 &&
                (profile.businessOutcomes ?? []).length === 0
              }
            >
              {(profile.primaryUseCases ?? []).length > 0 ? (
                <ul className="list-disc space-y-2 pl-5 text-[17px]">
                  {(profile.primaryUseCases ?? []).map((item) => (
                    <ReadItem
                      key={item}
                      text={item}
                      refs={refs}
                      sources={sources}
                      sourceIndex={sourceIndex}
                    />
                  ))}
                </ul>
              ) : null}
              {(profile.businessOutcomes ?? []).length > 0 ? (
                <div>
                  <p className="text-sm font-medium text-slate-600">Outcomes</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px]">
                    {(profile.businessOutcomes ?? []).map((item) => (
                      <ReadItem
                        key={item}
                        text={item}
                        refs={refs}
                        sources={sources}
                        sourceIndex={sourceIndex}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </ReadSection>

            <ReadSection
              title="How it's sold"
              empty={!profile.deploymentContext && !profile.pricingAovContext}
            >
              {profile.deploymentContext ? (
                <p className="text-[17px] leading-7 text-slate-800">
                  {profile.deploymentContext}
                  <EvidenceChip
                    refs={evidenceRefsForText(profile.deploymentContext, refs)}
                    sources={sources}
                    sourceIndex={sourceIndex}
                  />
                </p>
              ) : null}
              {profile.pricingAovContext ? (
                <p className="text-[17px] leading-7 text-slate-800">
                  {profile.pricingAovContext}
                  <EvidenceChip
                    refs={evidenceRefsForText(profile.pricingAovContext, refs)}
                    sources={sources}
                    sourceIndex={sourceIndex}
                  />
                </p>
              ) : null}
            </ReadSection>

            <ReadSection
              title="Language"
              empty={(profile.terminology ?? []).length === 0}
            >
              <ul className="flex flex-wrap gap-2">
                {(profile.terminology ?? []).map((term) => (
                  <li
                    key={term}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-800"
                  >
                    {term}
                    <EvidenceChip
                      refs={evidenceRefsForText(term, refs)}
                      sources={sources}
                      sourceIndex={sourceIndex}
                    />
                  </li>
                ))}
              </ul>
            </ReadSection>

            <ReadSection
              title="Proof"
              empty={
                (profile.proofPoints ?? []).length === 0 &&
                (profile.customerEvidence ?? []).length === 0
              }
            >
              {(profile.proofPoints ?? []).length > 0 ? (
                <ul className="list-disc space-y-2 pl-5 text-[17px]">
                  {(profile.proofPoints ?? []).map((item) => (
                    <ReadItem
                      key={item}
                      text={item}
                      refs={refs}
                      sources={sources}
                      sourceIndex={sourceIndex}
                    />
                  ))}
                </ul>
              ) : null}
              {(profile.customerEvidence ?? []).length > 0 ? (
                <div>
                  <p className="text-sm font-medium text-slate-600">
                    Customer evidence
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px]">
                    {(profile.customerEvidence ?? []).map((item) => (
                      <ReadItem
                        key={item}
                        text={item}
                        refs={refs}
                        sources={sources}
                        sourceIndex={sourceIndex}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </ReadSection>
          </article>
        )}

        {unknownLabels.length > 0 ? (
          <aside
            className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-4"
            data-testid="unknown-fields-panel"
          >
            <h3 className="text-sm font-semibold text-slate-900">
              We didn&apos;t claim these — no supporting evidence was found.
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Listing what was refused rather than invented.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-800">
              {unknownLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </aside>
        ) : null}

        {messaging?.primaryPositioning ? (
          <p className="text-sm text-slate-500">
            Messaging guidance (not scoring evidence):{" "}
            {messaging.primaryPositioning}
          </p>
        ) : null}

        {sources.length > 0 ? (
          <section className="research-sources-appendix mt-8 border-t border-slate-200 pt-6">
            <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
              Sources
            </h3>
            <ul className="mt-3 space-y-3 text-sm text-slate-700">
              {sources.map((source) => {
                const number = sourceIndex.get(source.id) ?? 0;
                return (
                <li key={source.id}>
                  <p className="font-medium text-slate-900">
                    {number > 0 ? (
                      <span className="text-slate-500">[{number}] </span>
                    ) : null}
                    {source.displayName}
                  </p>
                  <p className="text-xs text-slate-500">{source.sourceType}</p>
                  {source.originalUrl ? (
                    <p className="break-all text-xs text-slate-600">
                      {source.originalUrl}
                    </p>
                  ) : null}
                  {source.filename ? (
                    <p className="text-xs text-slate-600">{source.filename}</p>
                  ) : null}
                </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <div className="border-t border-slate-200 pt-5" data-print-hide>
          <SubmitButton disabled={pending}>
            {pending ? "Saving…" : "Approve this profile"}
          </SubmitButton>
          <p className="mt-2 text-sm text-slate-500">
            This becomes the authoritative {vocab.product.singular} record. {vocab.persona.Plural}, scoring,
            and every email use it.
          </p>
          <Status result={state} />
        </div>
      </form>
    </div>
  );
}
