"use client";

import { useActionState, useState } from "react";
import {
  approveApplicationAssetAction,
  generateApplicationAssetAction,
  saveEditedApplicationAssetAction,
  type ApplicationAssetActionResult,
} from "@/app/actions/application-assets";
import {
  applicationAssetContentSchema,
  type ApplicationAssetContent,
  type AssetClaim,
} from "@/lib/application-assets/contract";
import type { PresentationPlan } from "@/lib/application-assets/plan-contract";
import type { StatementGroup } from "@/lib/application-assets/resume-statement-picks";
import { ResumeStatementPicker } from "@/components/ResumeStatementPicker";
import { formatResumeRoleMeta } from "@/lib/application-assets/dates";
import {
  formatAssetStatusLabel,
  formatClaimSupportLabel,
  hasVisibleText,
  sanitizeAssetContent,
  visibleItems,
} from "@/lib/application-assets/display";
import {
  applicationAssetConfig,
  consultationConfig,
  vocab,
} from "@/lib/product-config";
import { usePathname } from "next/navigation";
import { InlineActionStatus, trackedActionJobIds } from "@/components/InlineActionStatus";
import {
  AppActionLink,
  AppButton,
  SecondaryButton,
  SubmitButton,
} from "@/components/ui";
import {
  WORKSPACE_CARD_WRAP_CLASS,
  WORKSPACE_MESSAGE_WRAP_CLASS,
  workspaceAssetDocxHref,
  workspaceConsultationHrefFromPathname,
} from "@/lib/application/workspace-links";

type AssetRow = {
  id: string;
  type: "RESUME" | "COVER_LETTER";
  version: number;
  status: "DRAFT" | "APPROVED";
  content: ApplicationAssetContent;
  guidance: string | null;
  promptVersion: string;
  staleReason: string | null;
  createdAt: string;
};

type ProfileRole = {
  id: string;
  employer: string | null;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
};

type PlanRow = {
  type: "RESUME" | "COVER_LETTER";
  status: "DRAFT" | "ACCEPTED";
  plan: PresentationPlan;
};

const initial: ApplicationAssetActionResult | null = null;

function Status({
  result,
  errorsOnly = false,
  profileHref,
}: {
  result: ApplicationAssetActionResult | null;
  errorsOnly?: boolean;
  profileHref?: string | null;
}) {
  const pathname = usePathname() || "";
  if (!result) return null;
  if (trackedActionJobIds(result).length > 0) {
    return (
      <InlineActionStatus result={result} testId="asset-verification-status" />
    );
  }
  if (errorsOnly && result.ok) return null;
  const violations = visibleItems(result.violations ?? [], (item) => item);
  const messageLines = result.message
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => hasVisibleText(line) && !violations.includes(line));
  return (
    <div
      role="status"
      className={`${WORKSPACE_CARD_WRAP_CLASS} ${WORKSPACE_MESSAGE_WRAP_CLASS} ${
        result.ok ? "text-sm text-success" : "text-sm text-danger"
      }`}
      data-testid="asset-verification-status"
    >
      {messageLines.map((line) => (
        <p key={line} className={WORKSPACE_MESSAGE_WRAP_CLASS}>
          {line}
        </p>
      ))}
      {violations.length ? (
        <ul className={`mt-1 list-disc pl-5 ${WORKSPACE_MESSAGE_WRAP_CLASS}`}>
          {violations.map((violation) => (
            <li key={violation} className={WORKSPACE_MESSAGE_WRAP_CLASS}>
              {violation}
            </li>
          ))}
        </ul>
      ) : null}
      {!result.ok ? (
        <p
          className={`mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-ink ${WORKSPACE_MESSAGE_WRAP_CLASS}`}
        >
          {applicationAssetConfig.labels.violationFix
            .replace("{consultant}", consultationConfig.displayName)
            .replace("{product}", vocab.product.singular)}{" "}
          <AppActionLink
            href={workspaceConsultationHrefFromPathname(pathname)}
            variant="chip"
          >
            {consultationConfig.displayName}
          </AppActionLink>{" "}
          {profileHref ? (
            <AppActionLink href={profileHref} variant="chip">
              {vocab.product.Singular}
            </AppActionLink>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function claimSupportTitle(claim: AssetClaim): string {
  return claim.supports
    .map((item) => formatClaimSupportLabel(item.sourceId, item.quote))
    .join("\n");
}

function ClaimText({
  claim,
  editable = false,
  onChange,
}: {
  claim: AssetClaim;
  editable?: boolean;
  onChange?: (claimId: string, text: string) => void;
}) {
  const support = claimSupportTitle(claim);
  if (editable && onChange) {
    return (
      <textarea
        id={`claim-edit-${claim.id}`}
        data-testid={`claim-edit-${claim.id}`}
        value={claim.text}
        rows={Math.max(2, Math.ceil(claim.text.length / 72))}
        title={support}
        onChange={(event) => onChange(claim.id, event.target.value)}
        className="w-full resize-y border border-edge-strong bg-surface px-2 py-1 text-inherit leading-inherit outline-none focus-visible:ring-1 focus-visible:ring-focus"
      />
    );
  }
  return (
    <span title={support || undefined} className={support ? "cursor-help" : undefined}>
      {claim.text}
    </span>
  );
}

function ContactDetailsLine({
  claims,
  editable = false,
  onChange,
}: {
  claims: AssetClaim[];
  editable?: boolean;
  onChange?: (claimId: string, text: string) => void;
}) {
  const visible = visibleItems(claims, (claim) => claim.text);
  if (!visible.length) return null;
  if (editable && onChange) {
    return (
      <div className="mt-1 space-y-2 text-left">
        {visible.map((claim) => (
          <ClaimText
            key={claim.id}
            claim={claim}
            editable
            onChange={onChange}
          />
        ))}
      </div>
    );
  }
  return (
    <p className="mt-1">
      {visible.map((claim) => claim.text).join(" | ")}
    </p>
  );
}

function AssetPreview({
  content,
  earlierExperienceHeading,
  editable = false,
  onChange,
  onHeadingChange,
}: {
  content: ApplicationAssetContent;
  earlierExperienceHeading: string | null;
  editable?: boolean;
  onChange?: (claimId: string, text: string) => void;
  onHeadingChange?: (heading: string) => void;
}) {
  if (content.type === "COVER_LETTER") {
    const paragraphs = visibleItems(content.paragraphs, (claim) => claim.text);
    return (
      <article className="space-y-4 text-sm leading-6 text-ink">
        {hasVisibleText(content.salutation) ? <p>{content.salutation}</p> : null}
        {paragraphs.length ? (
          paragraphs.map((claim) => (
            <p key={claim.id}>
              <ClaimText
                claim={claim}
                editable={editable}
                onChange={onChange}
              />
            </p>
          ))
        ) : (
          <p className="text-sm text-muted">
            {applicationAssetConfig.labels.emptySection}
          </p>
        )}
        <p>
          {content.signoff}
          <br />
          {content.signerName}
        </p>
      </article>
    );
  }
  if (content.type !== "RESUME") return null;
  const featured = content.experience.filter((role) => !role.hidden && !role.condensed);
  const condensed = content.experience.filter((role) => !role.hidden && role.condensed);
  return (
    <article className="space-y-4 text-sm text-ink">
      <header className="text-center">
        <h4 className="text-xl font-semibold">
          <ClaimText
            claim={content.header.name}
            editable={editable}
            onChange={onChange}
          />
        </h4>
        <ContactDetailsLine
          claims={content.header.contactDetails}
          editable={editable}
          onChange={onChange}
        />
      </header>
      <AssetSection title={applicationAssetConfig.resumeHeadings.summary}>
        {visibleItems(content.summary, (claim) => claim.text).length ? (
          visibleItems(content.summary, (claim) => claim.text).map((claim) => (
            <p key={claim.id}>
              <ClaimText
                claim={claim}
                editable={editable}
                onChange={onChange}
              />
            </p>
          ))
        ) : (
          <p className="text-sm text-muted">
            {applicationAssetConfig.labels.emptySection}
          </p>
        )}
      </AssetSection>
      <AssetSection title={applicationAssetConfig.resumeHeadings.experience}>
        {featured.length === 0 ? (
          <p className="text-sm text-muted">
            {applicationAssetConfig.labels.emptySection}
          </p>
        ) : null}
        {featured.map((role) => (
          <div key={role.roleId} className="space-y-1">
            <p className="font-medium">
              {role.title}, {role.employer}
            </p>
            <p className="text-xs text-muted">
              {formatResumeRoleMeta(role)}
            </p>
            {visibleItems(role.bullets, (claim) => claim.text).length ? (
              <ul className="list-disc pl-5">
                {visibleItems(role.bullets, (claim) => claim.text).map((claim) => (
                  <li key={claim.id}>
                    <ClaimText
                      claim={claim}
                      editable={editable}
                      onChange={onChange}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                {applicationAssetConfig.labels.emptySection}
              </p>
            )}
          </div>
        ))}
        {condensed.length > 0 ? (
          <div className="space-y-1" data-testid="condensed-roles">
            {earlierExperienceHeading || editable ? (
              editable && onHeadingChange ? (
                <label className="block">
                  <span className="sr-only">Earlier experience heading</span>
                  <input
                    type="text"
                    value={earlierExperienceHeading ?? ""}
                    onChange={(event) => onHeadingChange(event.target.value)}
                    className="w-full rounded-md border border-edge-strong px-2 py-1 font-medium text-ink"
                    data-testid="earlier-experience-heading-input"
                  />
                </label>
              ) : earlierExperienceHeading ? (
                <p
                  className="font-medium"
                  data-testid="earlier-experience-heading"
                >
                  {earlierExperienceHeading}
                </p>
              ) : null
            ) : null}
            {condensed.map((role) => (
              <p key={role.roleId} className="font-medium">
                {role.title}, {role.employer}
              </p>
            ))}
          </div>
        ) : null}
      </AssetSection>
      {[
        [applicationAssetConfig.resumeHeadings.skills, content.skills],
        [applicationAssetConfig.resumeHeadings.education, content.education],
        [applicationAssetConfig.resumeHeadings.credentials, content.credentials],
      ].map(([title, claims]) =>
        visibleItems(claims as AssetClaim[], (claim) => claim.text).length ? (
          <AssetSection key={title as string} title={title as string}>
            {visibleItems(claims as AssetClaim[], (claim) => claim.text).map(
              (claim) => (
                <p key={claim.id}>
                  <ClaimText
                    claim={claim}
                    editable={editable}
                    onChange={onChange}
                  />
                </p>
              ),
            )}
          </AssetSection>
        ) : null,
      )}
    </article>
  );
}

function AssetSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h5 className="mb-2 border-b border-edge-strong text-xs font-semibold uppercase tracking-wide">
        {title}
      </h5>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function mapClaimText(
  content: ApplicationAssetContent,
  claimId: string,
  text: string,
): ApplicationAssetContent {
  const replace = (claim: AssetClaim) =>
    claim.id === claimId ? { ...claim, text } : claim;
  if (content.type === "COVER_LETTER") {
    return { ...content, paragraphs: content.paragraphs.map(replace) };
  }
  if (content.type !== "RESUME") return content;
  return {
    ...content,
    header: {
      name: replace(content.header.name),
      contactDetails: content.header.contactDetails.map(replace),
    },
    summary: content.summary.map(replace),
    experience: content.experience.map((role) => ({
      ...role,
      bullets: role.bullets.map(replace),
    })),
    skills: content.skills.map(replace),
    education: content.education.map(replace),
    credentials: content.credentials.map(replace),
  };
}

function AssetVersionEditor({
  campaignId,
  asset,
  earlierExperienceHeading,
}: {
  campaignId: string;
  asset: AssetRow;
  earlierExperienceHeading: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(asset.content);
  const [heading, setHeading] = useState(earlierExperienceHeading ?? "");
  const [result, action] = useActionState(saveEditedApplicationAssetAction, initial);

  if (!editing) {
    return (
      <div
        className="space-y-4"
        data-testid="asset-in-place-editor"
        data-asset-version={asset.version}
      >
        <AssetPreview
          content={asset.content}
          earlierExperienceHeading={earlierExperienceHeading}
        />
        <SecondaryButton
          type="button"
          onClick={() => {
            setContent(asset.content);
            setHeading(earlierExperienceHeading ?? "");
            setEditing(true);
          }}
        >
          {applicationAssetConfig.labels.adjustManually}
        </SecondaryButton>
        <Status result={result} />
      </div>
    );
  }

  return (
    <form
      action={action}
      className="space-y-4"
      data-testid="asset-in-place-editor"
      data-asset-version={asset.version}
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="assetId" value={asset.id} />
      <input type="hidden" name="contentJson" value={JSON.stringify(content)} />
      {asset.content.type === "RESUME" ? (
        <input
          type="hidden"
          name="earlierExperienceHeading"
          value={heading}
        />
      ) : null}
      <AssetPreview
        content={content}
        earlierExperienceHeading={
          asset.content.type === "RESUME" ? heading : earlierExperienceHeading
        }
        editable
        onChange={(claimId, text) =>
          setContent((current) => mapClaimText(current, claimId, text))
        }
        onHeadingChange={
          asset.content.type === "RESUME" ? setHeading : undefined
        }
      />
      <div className="flex flex-wrap gap-2">
        <SubmitButton>{applicationAssetConfig.labels.saveNewVersion}</SubmitButton>
        <SecondaryButton
          type="button"
          onClick={() => {
            setContent(asset.content);
            setHeading(earlierExperienceHeading ?? "");
            setEditing(false);
          }}
        >
          {applicationAssetConfig.labels.cancel}
        </SecondaryButton>
      </div>
      <Status result={result} />
    </form>
  );
}

function sortAssetsNewestFirst(rows: AssetRow[]): AssetRow[] {
  return [...rows].sort((a, b) => b.version - a.version);
}

function AssetHistory({
  campaignId,
  rows,
  canEdit,
  earlierExperienceHeading,
  profileHref,
}: {
  campaignId: string;
  rows: AssetRow[];
  canEdit: boolean;
  earlierExperienceHeading: string | null;
  profileHref: string | null;
}) {
  const [approveResult, approveAction] = useActionState(
    approveApplicationAssetAction,
    initial,
  );
  const ordered = sortAssetsNewestFirst(rows);
  return (
    <div className="space-y-3" data-testid="asset-version-history">
      {ordered.map((asset, index) => (
        <details
          key={asset.id}
          open={index === 0}
          className="rounded-md border border-edge p-4"
        >
          <summary className="cursor-pointer text-sm font-medium">
            Version {asset.version} · {formatAssetStatusLabel(asset.status)}
          </summary>
          <div className="mt-4 space-y-4">
            {canEdit ? (
              <AssetVersionEditor
                key={`${asset.id}-${asset.version}`}
                campaignId={campaignId}
                asset={asset}
                earlierExperienceHeading={earlierExperienceHeading}
              />
            ) : (
              <AssetPreview
                content={asset.content}
                earlierExperienceHeading={earlierExperienceHeading}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <AppActionLink href={workspaceAssetDocxHref(asset.id)}>
                {applicationAssetConfig.labels.downloadDocx}
              </AppActionLink>
              {canEdit && asset.status !== "APPROVED" ? (
                <form action={approveAction}>
                  <input type="hidden" name="campaignId" value={campaignId} />
                  <input type="hidden" name="assetId" value={asset.id} />
                  <SubmitButton>
                    {applicationAssetConfig.labels.approve}
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          </div>
        </details>
      ))}
      <Status result={approveResult} profileHref={profileHref} />
    </div>
  );
}

function AssetTypePanel({
  campaignId,
  type,
  rows,
  profileRoles,
  plan,
  planError,
  canEdit,
  thinNotice,
  missingContacts,
  profileHref,
  profileEditHref,
  statementGroups,
}: {
  campaignId: string;
  type: "RESUME" | "COVER_LETTER";
  rows: AssetRow[];
  profileRoles: ProfileRole[];
  plan: PlanRow | null;
  planError: string | null;
  canEdit: boolean;
  thinNotice: string | null;
  missingContacts: string[];
  profileHref: string | null;
  profileEditHref: string | null;
  statementGroups: StatementGroup[];
}) {
  const [result, action] = useActionState(generateApplicationAssetAction, initial);
  const orderedRows = sortAssetsNewestFirst(rows);
  const latest = orderedRows[0] ?? null;
  const latestResume =
    type === "RESUME" && latest?.content.type === "RESUME"
      ? latest.content
      : null;
  const earlierExperienceHeading =
    plan?.plan.type === "RESUME" ? plan.plan.earlierExperienceHeading : null;
  const documentId =
    type === "RESUME" ? "resume-document" : "cover-letter-document";
  return (
    <section
      id={documentId}
      className={`space-y-4 rounded-md border border-edge p-4 ${WORKSPACE_CARD_WRAP_CLASS}`}
    >
      <h3 className="font-semibold text-ink">
        {type === "RESUME"
          ? applicationAssetConfig.labels.resume
          : applicationAssetConfig.labels.coverLetter}
      </h3>
      {type === "RESUME" ? (
        <ResumeStatementPicker
          campaignId={campaignId}
          groups={statementGroups}
          canEdit={canEdit}
        />
      ) : null}
      {latest?.staleReason ? (
        <p
          className={`text-sm text-warning ${WORKSPACE_MESSAGE_WRAP_CLASS}`}
          data-testid={`${type.toLowerCase()}-new-information`}
        >
          {latest.staleReason}
        </p>
      ) : null}
      {type === "RESUME" && missingContacts.length > 0 ? (
        <p
          className={`text-sm text-warning ${WORKSPACE_MESSAGE_WRAP_CLASS}`}
          data-testid="resume-missing-contact"
        >
          {applicationAssetConfig.missingContact.heading}:{" "}
          {missingContacts.join(", ")}.{" "}
          {profileEditHref ? (
            <AppActionLink href={profileEditHref} variant="chip">
              {vocab.product.Singular}
            </AppActionLink>
          ) : null}{" "}
          {applicationAssetConfig.missingContact.addInProfile}
        </p>
      ) : null}
      {type === "COVER_LETTER" && thinNotice ? (
        <p className="text-sm text-muted" data-testid="cover-letter-thin-evidence">
          {thinNotice}
        </p>
      ) : null}
      {planError ? (
        <p className="text-sm text-danger" role="status">
          {planError}
        </p>
      ) : null}
      {orderedRows.length ? (
        <AssetHistory
          campaignId={campaignId}
          rows={orderedRows}
          canEdit={canEdit}
          earlierExperienceHeading={earlierExperienceHeading}
          profileHref={profileHref}
        />
      ) : (
        <p className="text-sm text-muted">
          {applicationAssetConfig.labels.emptyHistory}
        </p>
      )}
      {canEdit ? (
        <form action={action} className="space-y-3">
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="type" value={type} />
          {type === "RESUME" ? (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                {applicationAssetConfig.labels.hideRolesLegend}
              </summary>
              <fieldset className="mt-2">
                <legend className="sr-only">
                  {applicationAssetConfig.labels.hideRolesLegend}
                </legend>
                <div className="mt-2 space-y-1">
                  {profileRoles.map((role) => (
                    <label key={role.id} className="block text-sm">
                      <input
                        type="checkbox"
                        name="hiddenRoleId"
                        value={role.id}
                        defaultChecked={Boolean(
                          latestResume?.experience.find(
                            (item) => item.roleId === role.id,
                          )?.hidden,
                        )}
                        className="mr-2"
                      />
                      {[role.title, role.employer].filter(Boolean).join(" at ")}
                    </label>
                  ))}
                </div>
              </fieldset>
            </details>
          ) : null}
          {orderedRows.length ? (
            <label className="block text-sm">
              <span className="font-medium text-ink">
                {applicationAssetConfig.labels.changeInstruction}
              </span>
              <textarea
                name="regenerationInstruction"
                rows={2}
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
                data-testid={`${type.toLowerCase()}-regenerate-instruction`}
              />
            </label>
          ) : null}
          <SubmitButton>
            {orderedRows.length
              ? applicationAssetConfig.labels.regenerate
              : applicationAssetConfig.labels.generate}
          </SubmitButton>
          <Status
            result={result}
            errorsOnly={
              !(
                result?.ok &&
                (result.message ===
                  applicationAssetConfig.labels.unchangedResume ||
                  result.message ===
                    applicationAssetConfig.labels.unchangedCoverLetter)
              )
            }
            profileHref={profileHref}
          />
        </form>
      ) : null}
    </section>
  );
}

export function ApplicationAssetsSection({
  campaignId,
  assets,
  profileRoles,
  plans,
  invalidPlanTypes = [],
  canEdit,
  coverLetterThinNotice = null,
  missingResumeContacts = [],
  profileHref = null,
  profileEditHref = null,
  defaultOpen = false,
  statementGroups = [],
}: {
  campaignId: string;
  assets: Array<
    Omit<AssetRow, "content"> & {
      content: unknown;
    }
  >;
  profileRoles: ProfileRole[];
  plans: PlanRow[];
  invalidPlanTypes?: Array<"RESUME" | "COVER_LETTER">;
  canEdit: boolean;
  coverLetterThinNotice?: string | null;
  missingResumeContacts?: string[];
  profileHref?: string | null;
  profileEditHref?: string | null;
  defaultOpen?: boolean;
  statementGroups?: StatementGroup[];
}) {
  const [activeType, setActiveType] = useState<"RESUME" | "COVER_LETTER">(
    "RESUME",
  );
  const valid = assets.flatMap((asset) => {
    const parsed = applicationAssetContentSchema.safeParse(asset.content);
    if (parsed.success) {
      return [
        {
          ...asset,
          content: sanitizeAssetContent(parsed.data),
        },
      ];
    }
    if (
      asset.content &&
      typeof asset.content === "object" &&
      "type" in asset.content &&
      ((asset.content as ApplicationAssetContent).type === "RESUME" ||
        (asset.content as ApplicationAssetContent).type === "COVER_LETTER")
    ) {
      try {
        const sanitized = sanitizeAssetContent(
          asset.content as ApplicationAssetContent,
        );
        const retry = applicationAssetContentSchema.safeParse(sanitized);
        return retry.success
          ? [
              {
                ...asset,
                content: retry.data,
              },
            ]
          : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  return (
    <details
      open={defaultOpen}
      className={`space-y-4 rounded-lg border border-edge bg-surface p-5 ${WORKSPACE_CARD_WRAP_CLASS}`}
      data-testid="application-assets"
    >
      <summary className="cursor-pointer text-base font-semibold text-ink">
        {applicationAssetConfig.labels.sectionTitle}
      </summary>
      <div className="mt-4 space-y-4">
        <p
          role="note"
          data-testid="assets-proofread-notice"
          className="rounded-md border border-warning bg-warning-tint px-4 py-3 text-sm font-bold text-warning"
        >
          {applicationAssetConfig.labels.proofreadNotice}
        </p>
        <p className="text-sm text-muted">
          {applicationAssetConfig.labels.sectionHelp}
        </p>
        <div className="flex flex-wrap gap-2">
          <AppButton
            type="button"
            variant={activeType === "RESUME" ? "primary" : "secondary"}
            aria-pressed={activeType === "RESUME"}
            onClick={() => setActiveType("RESUME")}
          >
            {applicationAssetConfig.labels.viewEditResume}
          </AppButton>
          <AppButton
            type="button"
            variant={activeType === "COVER_LETTER" ? "primary" : "secondary"}
            aria-pressed={activeType === "COVER_LETTER"}
            onClick={() => setActiveType("COVER_LETTER")}
          >
            {applicationAssetConfig.labels.viewEditCoverLetter}
          </AppButton>
        </div>
        <div className="space-y-4">
          {(["RESUME", "COVER_LETTER"] as const).map((type) => (
            <div
              key={type}
              className={activeType === type ? undefined : "hidden"}
              hidden={activeType !== type}
            >
              <AssetTypePanel
                campaignId={campaignId}
                type={type}
                rows={valid.filter((asset) => asset.type === type)}
                profileRoles={profileRoles}
                plan={plans.find((item) => item.type === type) ?? null}
                planError={
                  invalidPlanTypes.includes(type)
                    ? applicationAssetConfig.labels.planFailed
                    : null
                }
                canEdit={canEdit}
                thinNotice={
                  type === "COVER_LETTER" ? coverLetterThinNotice : null
                }
                missingContacts={
                  type === "RESUME" ? missingResumeContacts : []
                }
                statementGroups={type === "RESUME" ? statementGroups : []}
                profileHref={profileHref}
                profileEditHref={profileEditHref}
              />
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
