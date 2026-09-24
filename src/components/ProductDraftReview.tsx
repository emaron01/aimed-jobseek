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
  CandidateProfile,
  ProfileExperienceRole,
  ProfileFactItem,
} from "@/lib/product-research/candidate-profile";
import {
  emptyCandidateProfile,
  parseCandidateProfileSafe,
} from "@/lib/product-research/candidate-profile";
import {
  CANDIDATE_PROFILE_FIELD_HINTS,
  describeProductSourceLead,
  productSourceTypeLabel,
  sourceLabelForId,
  type ProductReviewSource,
} from "@/lib/product-research/review";
import {
  buildSourceIndex,
  sourceMarkerNumbers,
} from "@/lib/research/source-index";
import { vocab } from "@/lib/product-config";

const initialResult: ProductSetupActionResult | null = null;

function normalizeProfile(draft: CandidateProfile): CandidateProfile {
  const parsed = parseCandidateProfileSafe(draft);
  return parsed.ok ? parsed.profile : emptyCandidateProfile();
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

function KindBadge({ kind }: { kind: "FACT" | "INFERENCE" }) {
  return (
    <span
      className={
        kind === "FACT"
          ? "ml-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
          : "ml-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900"
      }
      data-testid={`profile-kind-${kind}`}
    >
      {kind}
    </span>
  );
}

function ProvenanceChip({
  sourceIds,
  sources,
  sourceIndex,
}: {
  sourceIds: string[];
  sources: ProductReviewSource[];
  sourceIndex: Map<string, number>;
}) {
  const [open, setOpen] = useState(false);
  if (sourceIds.length === 0) return null;
  const label =
    sourceIds
      .map((id) => sourceLabelForId(id, sources))
      .filter((name) => name !== "Source")[0] ?? "Source";
  const markers = sourceMarkerNumbers([...new Set(sourceIds)], sourceIndex);

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
        {sourceIds.length > 1 ? ` +${sourceIds.length - 1}` : ""}
      </button>
      <span className="research-source-chip-print hidden rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 print:inline">
        {label}
      </span>
      {open ? (
        <span className="research-source-chip-popup absolute left-0 z-10 mt-1 w-72 rounded-md border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-sm print:hidden">
          {sourceIds.map((id) => (
            <span key={id} className="block text-slate-500">
              {sourceLabelForId(id, sources)}
            </span>
          ))}
        </span>
      ) : null}
      <SourceMarkers numbers={markers} />
    </span>
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

function FactLine({
  item,
  sources,
  sourceIndex,
}: {
  item: ProfileFactItem | null | undefined;
  sources: ProductReviewSource[];
  sourceIndex: Map<string, number>;
}) {
  if (!item?.text?.trim()) return null;
  return (
    <p className="text-[17px] leading-7 text-slate-800">
      {item.text}
      <KindBadge kind={item.kind} />
      <ProvenanceChip
        sourceIds={item.provenance.map((ref) => ref.sourceId)}
        sources={sources}
        sourceIndex={sourceIndex}
      />
    </p>
  );
}

function FactList({
  items,
  sources,
  sourceIndex,
}: {
  items: ProfileFactItem[];
  sources: ProductReviewSource[];
  sourceIndex: Map<string, number>;
}) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-[17px]">
      {items.map((item) => (
        <li key={item.id} className="leading-relaxed text-slate-800">
          {item.text}
          <KindBadge kind={item.kind} />
          <ProvenanceChip
            sourceIds={item.provenance.map((ref) => ref.sourceId)}
            sources={sources}
            sourceIndex={sourceIndex}
          />
        </li>
      ))}
    </ul>
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
  name?: string;
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

function updateOptionalFact(
  current: ProfileFactItem | null | undefined,
  text: string,
  id: string,
): ProfileFactItem | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (current) return { ...current, text: trimmed };
  return { id, kind: "INFERENCE", text: trimmed, provenance: [] };
}

function updateFactList(
  current: ProfileFactItem[],
  value: string,
  idPrefix: string,
): ProfileFactItem[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((text, index) => {
    const existing = current[index];
    if (existing) return { ...existing, text };
    return {
      id: `${idPrefix}_${index + 1}`,
      kind: "INFERENCE" as const,
      text,
      provenance: [],
    };
  });
}

function RoleBlock({
  role,
  sources,
  sourceIndex,
}: {
  role: ProfileExperienceRole;
  sources: ProductReviewSource[];
  sourceIndex: Map<string, number>;
}) {
  const dates = [role.startDate, role.endDate ?? "Present"]
    .filter(Boolean)
    .join(" – ");
  return (
    <div className="space-y-2">
      <p className="text-[17px] font-medium text-slate-900">
        {[role.title, role.employer].filter(Boolean).join(" · ") || "Role"}
        <KindBadge kind={role.kind} />
        <ProvenanceChip
          sourceIds={role.provenance.map((ref) => ref.sourceId)}
          sources={sources}
          sourceIndex={sourceIndex}
        />
      </p>
      <p className="text-sm text-slate-500">
        {[dates, role.location].filter(Boolean).join(" · ")}
      </p>
      {role.summary ? (
        <p className="text-[17px] leading-7 text-slate-800">{role.summary}</p>
      ) : null}
      {role.achievements.length > 0 ? (
        <FactList
          items={role.achievements}
          sources={sources}
          sourceIndex={sourceIndex}
        />
      ) : null}
    </div>
  );
}

export function ProductDraftReview({
  productId,
  setupRunId,
  productName,
  websiteUrl,
  sources,
  draft,
}: {
  productId: string;
  setupRunId: string;
  productName: string;
  websiteUrl: string | null;
  sources: ProductReviewSource[];
  draft: CandidateProfile;
  messaging?: unknown;
}) {
  const [state, action, pending] = useActionState(
    saveApprovedProductAction,
    initialResult,
  );
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(productName);
  const [url, setUrl] = useState(websiteUrl ?? "");
  const [profile, setProfile] = useState<CandidateProfile>(() =>
    normalizeProfile(draft),
  );

  const draftKey = `${productName}\0${websiteUrl ?? ""}\0${JSON.stringify(draft)}`;
  const [appliedDraftKey, setAppliedDraftKey] = useState(draftKey);
  if (draftKey !== appliedDraftKey) {
    setAppliedDraftKey(draftKey);
    setName(productName);
    setUrl(websiteUrl ?? "");
    setProfile(normalizeProfile(draft));
  }
  if (state?.ok && editing) {
    setEditing(false);
  }

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  const sourceLead = useMemo(
    () => describeProductSourceLead({ sources, draft: profile }),
    [sources, profile],
  );
  const sourceIndex = useMemo(
    () => buildSourceIndex(sources, (source) => source.id),
    [sources],
  );

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
          name="candidateProfileJson"
          value={JSON.stringify(profile)}
        />
        {!editing ? (
          <>
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="websiteUrl" value={url} />
          </>
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">
              {editing ? (
                <span className="sr-only">Edit {vocab.product.singular}</span>
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
              hint={CANDIDATE_PROFILE_FIELD_HINTS.name}
              value={name}
              onChange={setName}
              singleLine
            />
            <EditField
              label="Personal site, portfolio, or GitHub"
              name="websiteUrl"
              hint={CANDIDATE_PROFILE_FIELD_HINTS.websiteUrl}
              value={url}
              onChange={setUrl}
              singleLine
            />
            <EditField
              label="Name"
              hint={CANDIDATE_PROFILE_FIELD_HINTS["identity.name"]}
              value={profile.identity.name?.text ?? ""}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  identity: {
                    ...prev.identity,
                    name: updateOptionalFact(prev.identity.name, value, "id_name"),
                  },
                }))
              }
              singleLine
            />
            <EditField
              label="Current headline"
              hint={CANDIDATE_PROFILE_FIELD_HINTS["identity.headline"]}
              value={profile.identity.headline?.text ?? ""}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  identity: {
                    ...prev.identity,
                    headline: updateOptionalFact(
                      prev.identity.headline,
                      value,
                      "id_headline",
                    ),
                  },
                }))
              }
            />
            <EditField
              label="Location"
              hint={CANDIDATE_PROFILE_FIELD_HINTS["identity.location"]}
              value={profile.identity.location?.text ?? ""}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  identity: {
                    ...prev.identity,
                    location: updateOptionalFact(
                      prev.identity.location,
                      value,
                      "id_location",
                    ),
                  },
                }))
              }
              singleLine
            />
            <EditField
              label="Email"
              hint={CANDIDATE_PROFILE_FIELD_HINTS["identity.email"]}
              value={profile.identity.email?.text ?? ""}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  identity: {
                    ...prev.identity,
                    email: updateOptionalFact(prev.identity.email, value, "id_email"),
                  },
                }))
              }
              singleLine
            />
            <EditField
              label="Phone"
              hint={CANDIDATE_PROFILE_FIELD_HINTS["identity.phone"]}
              value={profile.identity.phone?.text ?? ""}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  identity: {
                    ...prev.identity,
                    phone: updateOptionalFact(prev.identity.phone, value, "id_phone"),
                  },
                }))
              }
              singleLine
            />
            <EditField
              label="City and state"
              hint={CANDIDATE_PROFILE_FIELD_HINTS["identity.cityState"]}
              value={profile.identity.cityState?.text ?? ""}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  identity: {
                    ...prev.identity,
                    cityState: updateOptionalFact(
                      prev.identity.cityState,
                      value,
                      "id_city_state",
                    ),
                  },
                }))
              }
              singleLine
            />
            <EditField
              label="LinkedIn URL"
              hint={CANDIDATE_PROFILE_FIELD_HINTS["identity.linkedinUrl"]}
              value={profile.identity.linkedinUrl?.text ?? ""}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  identity: {
                    ...prev.identity,
                    linkedinUrl: updateOptionalFact(
                      prev.identity.linkedinUrl,
                      value,
                      "id_linkedin_url",
                    ),
                  },
                }))
              }
              singleLine
            />
            <EditField
              label="Personal site"
              hint={CANDIDATE_PROFILE_FIELD_HINTS["identity.personalSite"]}
              value={profile.identity.personalSite?.text ?? ""}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  identity: {
                    ...prev.identity,
                    personalSite: updateOptionalFact(
                      prev.identity.personalSite,
                      value,
                      "id_personal_site",
                    ),
                  },
                }))
              }
              singleLine
            />
            <EditField
              label="Work arrangement"
              hint={CANDIDATE_PROFILE_FIELD_HINTS["identity.workArrangementPreference"]}
              value={profile.identity.workArrangementPreference?.text ?? ""}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  identity: {
                    ...prev.identity,
                    workArrangementPreference: updateOptionalFact(
                      prev.identity.workArrangementPreference,
                      value,
                      "id_work_arrangement",
                    ),
                  },
                }))
              }
              singleLine
            />
            <EditField
              label="Relocation"
              hint={CANDIDATE_PROFILE_FIELD_HINTS["identity.relocationOpenness"]}
              value={profile.identity.relocationOpenness?.text ?? ""}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  identity: {
                    ...prev.identity,
                    relocationOpenness: updateOptionalFact(
                      prev.identity.relocationOpenness,
                      value,
                      "id_relocation",
                    ),
                  },
                }))
              }
              singleLine
            />
            <EditField
              label="Positioning statement"
              hint={CANDIDATE_PROFILE_FIELD_HINTS.positioning}
              value={profile.positioning?.text ?? ""}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  positioning: updateOptionalFact(
                    prev.positioning,
                    value,
                    "id_positioning",
                  ),
                }))
              }
              minRows={4}
            />
            <EditField
              label="Target titles"
              hint={CANDIDATE_PROFILE_FIELD_HINTS["direction.targetTitles"]}
              value={profile.direction.targetTitles.map((item) => item.text).join("\n")}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  direction: {
                    ...prev.direction,
                    targetTitles: updateFactList(
                      prev.direction.targetTitles,
                      value,
                      "id_title",
                    ),
                  },
                }))
              }
            />
            <EditField
              label="Seniority"
              hint={CANDIDATE_PROFILE_FIELD_HINTS["direction.seniority"]}
              value={profile.direction.seniority?.text ?? ""}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  direction: {
                    ...prev.direction,
                    seniority: updateOptionalFact(
                      prev.direction.seniority,
                      value,
                      "id_seniority",
                    ),
                  },
                }))
              }
            />
            <EditField
              label="Functions"
              hint={CANDIDATE_PROFILE_FIELD_HINTS["direction.functions"]}
              value={profile.direction.functions.map((item) => item.text).join("\n")}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  direction: {
                    ...prev.direction,
                    functions: updateFactList(
                      prev.direction.functions,
                      value,
                      "id_fn",
                    ),
                  },
                }))
              }
            />
            <EditField
              label="Career goals"
              hint={CANDIDATE_PROFILE_FIELD_HINTS["direction.careerGoals"]}
              value={profile.direction.careerGoals.map((item) => item.text).join("\n")}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  direction: {
                    ...prev.direction,
                    careerGoals: updateFactList(
                      prev.direction.careerGoals,
                      value,
                      "id_goal",
                    ),
                  },
                }))
              }
            />
            <EditField
              label="Skills and competencies"
              hint={CANDIDATE_PROFILE_FIELD_HINTS.skills}
              value={profile.skills.map((item) => item.text).join("\n")}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  skills: updateFactList(prev.skills, value, "skill"),
                }))
              }
            />
            <EditField
              label="Problems solved for employers"
              hint={CANDIDATE_PROFILE_FIELD_HINTS.problemsSolved}
              value={profile.problemsSolved.map((item) => item.text).join("\n")}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  problemsSolved: updateFactList(
                    prev.problemsSolved,
                    value,
                    "prob",
                  ),
                }))
              }
            />
            <EditField
              label="Differentiators"
              hint={CANDIDATE_PROFILE_FIELD_HINTS.differentiators}
              value={profile.differentiators.map((item) => item.text).join("\n")}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  differentiators: updateFactList(
                    prev.differentiators,
                    value,
                    "diff",
                  ),
                }))
              }
            />
            <EditField
              label="Education"
              hint={CANDIDATE_PROFILE_FIELD_HINTS.education}
              value={profile.education.map((item) => item.text).join("\n")}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  education: updateFactList(prev.education, value, "edu"),
                }))
              }
            />
            <EditField
              label="Credentials"
              hint={CANDIDATE_PROFILE_FIELD_HINTS.credentials}
              value={profile.credentials.map((item) => item.text).join("\n")}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  credentials: updateFactList(prev.credentials, value, "cred"),
                }))
              }
            />
            <EditField
              label="Domain vocabulary"
              hint={CANDIDATE_PROFILE_FIELD_HINTS.domainVocabulary}
              value={profile.domainVocabulary.map((item) => item.text).join("\n")}
              onChange={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  domainVocabulary: updateFactList(
                    prev.domainVocabulary,
                    value,
                    "term",
                  ),
                }))
              }
            />
          </div>
        ) : (
          <article className="space-y-8">
            <ReadSection
              title="Identity"
              empty={
                !profile.identity.name &&
                !profile.identity.headline &&
                !profile.identity.location &&
                !profile.identity.email &&
                !profile.identity.phone &&
                !profile.identity.cityState &&
                !profile.identity.linkedinUrl &&
                !profile.identity.personalSite
              }
            >
              <FactLine
                item={profile.identity.name}
                sources={sources}
                sourceIndex={sourceIndex}
              />
              <FactLine
                item={profile.identity.headline}
                sources={sources}
                sourceIndex={sourceIndex}
              />
              <FactLine
                item={profile.identity.location}
                sources={sources}
                sourceIndex={sourceIndex}
              />
              <FactLine
                item={profile.identity.email}
                sources={sources}
                sourceIndex={sourceIndex}
              />
              <FactLine
                item={profile.identity.phone}
                sources={sources}
                sourceIndex={sourceIndex}
              />
              <FactLine
                item={profile.identity.cityState}
                sources={sources}
                sourceIndex={sourceIndex}
              />
              <FactLine
                item={profile.identity.linkedinUrl}
                sources={sources}
                sourceIndex={sourceIndex}
              />
              <FactLine
                item={profile.identity.personalSite}
                sources={sources}
                sourceIndex={sourceIndex}
              />
              <FactLine
                item={profile.identity.workArrangementPreference}
                sources={sources}
                sourceIndex={sourceIndex}
              />
              <FactLine
                item={profile.identity.relocationOpenness}
                sources={sources}
                sourceIndex={sourceIndex}
              />
            </ReadSection>

            <ReadSection title="Positioning" empty={!profile.positioning}>
              <FactLine
                item={profile.positioning}
                sources={sources}
                sourceIndex={sourceIndex}
              />
            </ReadSection>

            <ReadSection
              title="Direction"
              empty={
                profile.direction.targetTitles.length === 0 &&
                !profile.direction.seniority &&
                profile.direction.functions.length === 0 &&
                profile.direction.careerGoals.length === 0
              }
            >
              {profile.direction.targetTitles.length > 0 ? (
                <div>
                  <p className="text-sm font-medium text-slate-600">Target titles</p>
                  <FactList
                    items={profile.direction.targetTitles}
                    sources={sources}
                    sourceIndex={sourceIndex}
                  />
                </div>
              ) : null}
              <FactLine
                item={profile.direction.seniority}
                sources={sources}
                sourceIndex={sourceIndex}
              />
              {profile.direction.functions.length > 0 ? (
                <div>
                  <p className="text-sm font-medium text-slate-600">Career functions</p>
                  <FactList
                    items={profile.direction.functions}
                    sources={sources}
                    sourceIndex={sourceIndex}
                  />
                </div>
              ) : null}
              {profile.direction.careerGoals.length > 0 ? (
                <div>
                  <p className="text-sm font-medium text-slate-600">Career goals</p>
                  <FactList
                    items={profile.direction.careerGoals}
                    sources={sources}
                    sourceIndex={sourceIndex}
                  />
                </div>
              ) : null}
            </ReadSection>

            <ReadSection title="Experience" empty={profile.experience.length === 0}>
              <div className="space-y-6">
                {profile.experience.map((role) => (
                  <RoleBlock
                    key={role.id}
                    role={role}
                    sources={sources}
                    sourceIndex={sourceIndex}
                  />
                ))}
              </div>
            </ReadSection>

            <ReadSection title="Skills and competencies" empty={profile.skills.length === 0}>
              <FactList
                items={profile.skills}
                sources={sources}
                sourceIndex={sourceIndex}
              />
            </ReadSection>

            <ReadSection
              title="Problems solved for employers"
              empty={profile.problemsSolved.length === 0}
            >
              <FactList
                items={profile.problemsSolved}
                sources={sources}
                sourceIndex={sourceIndex}
              />
            </ReadSection>

            <ReadSection
              title="Differentiators"
              empty={profile.differentiators.length === 0}
            >
              <FactList
                items={profile.differentiators}
                sources={sources}
                sourceIndex={sourceIndex}
              />
            </ReadSection>

            <ReadSection title="Education" empty={profile.education.length === 0}>
              <FactList
                items={profile.education}
                sources={sources}
                sourceIndex={sourceIndex}
              />
            </ReadSection>

            <ReadSection title="Credentials" empty={profile.credentials.length === 0}>
              <FactList
                items={profile.credentials}
                sources={sources}
                sourceIndex={sourceIndex}
              />
            </ReadSection>

            <ReadSection
              title="Domain vocabulary"
              empty={profile.domainVocabulary.length === 0}
            >
              <ul className="flex flex-wrap gap-2">
                {profile.domainVocabulary.map((term) => (
                  <li
                    key={term.id}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-800"
                  >
                    {term.text}
                    <KindBadge kind={term.kind} />
                    <ProvenanceChip
                      sourceIds={term.provenance.map((ref) => ref.sourceId)}
                      sources={sources}
                      sourceIndex={sourceIndex}
                    />
                  </li>
                ))}
              </ul>
            </ReadSection>
          </article>
        )}

        {profile.gaps.length > 0 ? (
          <aside
            className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-4"
            data-testid="profile-gaps-panel"
          >
            <h3 className="text-sm font-semibold text-slate-900">
              Gaps — no supporting evidence was found.
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Listing what was refused rather than invented.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-800">
              {profile.gaps.map((gap) => (
                <li key={gap.id}>
                  <span className="font-medium">{gap.area}:</span> {gap.detail}
                </li>
              ))}
            </ul>
          </aside>
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
                    <p className="text-xs text-slate-500">
                      {productSourceTypeLabel(source.sourceType)}
                    </p>
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
            This becomes the authoritative {vocab.product.singular} record. Later{" "}
            {vocab.campaign.plural} and generated documents use it.
          </p>
          <Status result={state} />
        </div>
      </form>
    </div>
  );
}
