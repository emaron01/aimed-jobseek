"use client";

import { useActionState, useMemo, useState } from "react";
import {
  acceptPresentationPlanAction,
  approveApplicationAssetAction,
  generateApplicationAssetAction,
  saveEditedApplicationAssetAction,
  writePresentationPlanAction,
  type ApplicationAssetActionResult,
} from "@/app/actions/application-assets";
import { ClaimFlagBanner } from "@/components/ClaimFlagBanner";
import {
  claimFlagsFromJson,
  openClaimFlags,
  type ClaimFlag,
} from "@/lib/grounding/claim-flags";
import {
  applicationAssetContentSchema,
  type ApplicationAssetContent,
  type AssetClaim,
} from "@/lib/application-assets/contract";
import type { PresentationPlan } from "@/lib/application-assets/plan-contract";
import { formatResumeRoleMeta } from "@/lib/application-assets/dates";
import {
  formatAssetStatusLabel,
  formatClaimEditorLabel,
  formatClaimSupportLabel,
  hasVisibleText,
  sanitizeAssetContent,
  visibleItems,
} from "@/lib/application-assets/display";
import {
  applicationAssetConfig,
  consultationConfig,
  vocab,
  workspaceSectionId,
} from "@/lib/product-config";
import { AppActionLink, SubmitButton } from "@/components/ui";
import {
  openWorkspaceSection,
  WORKSPACE_CARD_WRAP_CLASS,
  WORKSPACE_MESSAGE_WRAP_CLASS,
  workspaceAssetDocxHref,
  workspaceConsultationHref,
} from "@/lib/application/workspace-links";

type AssetRow = {
  id: string;
  type: "RESUME" | "COVER_LETTER";
  version: number;
  status: "DRAFT" | "APPROVED";
  content: ApplicationAssetContent;
  claimFlags: ClaimFlag[];
  guidance: string | null;
  promptVersion: string;
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
  if (!result) return null;
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
        result.ok ? "text-sm text-emerald-700" : "text-sm text-red-700"
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
          className={`mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-slate-700 ${WORKSPACE_MESSAGE_WRAP_CLASS}`}
        >
          {applicationAssetConfig.labels.violationFix
            .replace("{consultant}", consultationConfig.displayName)
            .replace("{product}", vocab.product.singular)}{" "}
          <AppActionLink
            href={workspaceConsultationHref()}
            variant="chip"
            onClick={() =>
              openWorkspaceSection(workspaceSectionId("CONSULTATION"))
            }
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

function ClaimFlagActions({
  campaignId,
  assetId,
  flag,
}: {
  campaignId: string;
  assetId: string;
  flag: ClaimFlag;
}) {
  return (
    <ClaimFlagBanner
      campaignId={campaignId}
      assetId={assetId}
      flag={flag}
      editHref={`#claim-edit-${flag.claimId}`}
    />
  );
}

function ClaimText({
  claim,
  flag,
  campaignId,
  assetId,
}: {
  claim: AssetClaim;
  flag?: ClaimFlag;
  campaignId?: string;
  assetId?: string;
}) {
  const support = claim.supports
    .map((item) => formatClaimSupportLabel(item.sourceId, item.quote))
    .join("\n");
  return (
    <span>
      <span title={support} tabIndex={0} className="cursor-help underline decoration-dotted">
        {claim.text}
      </span>
      {flag && campaignId && assetId ? (
        <ClaimFlagActions campaignId={campaignId} assetId={assetId} flag={flag} />
      ) : null}
    </span>
  );
}

function flagFor(flags: ClaimFlag[], claimId: string): ClaimFlag | undefined {
  return flags.find((flag) => flag.claimId === claimId);
}

function AssetPreview({
  content,
  earlierExperienceHeading,
  flags = [],
  campaignId,
  assetId,
}: {
  content: ApplicationAssetContent;
  earlierExperienceHeading: string | null;
  flags?: ClaimFlag[];
  campaignId?: string;
  assetId?: string;
}) {
  if (content.type === "COVER_LETTER") {
    const paragraphs = visibleItems(content.paragraphs, (claim) => claim.text);
    return (
      <article className="space-y-4 text-sm leading-6 text-slate-800">
        {hasVisibleText(content.salutation) ? <p>{content.salutation}</p> : null}
        {paragraphs.length ? (
          paragraphs.map((claim) => (
            <p key={claim.id}>
              <ClaimText
                claim={claim}
                flag={flagFor(flags, claim.id)}
                campaignId={campaignId}
                assetId={assetId}
              />
            </p>
          ))
        ) : (
          <p className="text-sm text-slate-600">
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
    <article className="space-y-4 text-sm text-slate-800">
      <header className="text-center">
        <h4 className="text-xl font-semibold">
          <ClaimText
            claim={content.header.name}
            flag={flagFor(flags, content.header.name.id)}
            campaignId={campaignId}
            assetId={assetId}
          />
        </h4>
        <p className="mt-1">
          {content.header.contactDetails.map((claim, index) => (
            <span key={claim.id}>
              {index > 0 ? " | " : ""}
              <ClaimText
                claim={claim}
                flag={flagFor(flags, claim.id)}
                campaignId={campaignId}
                assetId={assetId}
              />
            </span>
          ))}
        </p>
      </header>
      <AssetSection title={applicationAssetConfig.resumeHeadings.summary}>
        {visibleItems(content.summary, (claim) => claim.text).length ? (
          visibleItems(content.summary, (claim) => claim.text).map((claim) => (
            <p key={claim.id}>
              <ClaimText
                claim={claim}
                flag={flagFor(flags, claim.id)}
                campaignId={campaignId}
                assetId={assetId}
              />
            </p>
          ))
        ) : (
          <p className="text-sm text-slate-600">
            {applicationAssetConfig.labels.emptySection}
          </p>
        )}
      </AssetSection>
      <AssetSection title={applicationAssetConfig.resumeHeadings.experience}>
        {featured.length === 0 ? (
          <p className="text-sm text-slate-600">
            {applicationAssetConfig.labels.emptySection}
          </p>
        ) : null}
        {featured.map((role) => (
          <div key={role.roleId} className="space-y-1">
            <p className="font-medium">
              {role.title}, {role.employer}
            </p>
            <p className="text-xs text-slate-600">
              {formatResumeRoleMeta(role)}
            </p>
            {visibleItems(role.bullets, (claim) => claim.text).length ? (
              <ul className="list-disc pl-5">
                {visibleItems(role.bullets, (claim) => claim.text).map((claim) => (
                  <li key={claim.id}>
                    <ClaimText
                claim={claim}
                flag={flagFor(flags, claim.id)}
                campaignId={campaignId}
                assetId={assetId}
              />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">
                {applicationAssetConfig.labels.emptySection}
              </p>
            )}
          </div>
        ))}
        {condensed.length > 0 ? (
          <div className="space-y-1" data-testid="condensed-roles">
            {earlierExperienceHeading ? (
              <p className="font-medium">{earlierExperienceHeading}</p>
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
                flag={flagFor(flags, claim.id)}
                campaignId={campaignId}
                assetId={assetId}
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
      <h5 className="mb-2 border-b border-slate-300 text-xs font-semibold uppercase tracking-wide">
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

function AssetEditor({
  campaignId,
  asset,
}: {
  campaignId: string;
  asset: AssetRow;
}) {
  const [content, setContent] = useState(asset.content);
  const [result, action] = useActionState(saveEditedApplicationAssetAction, initial);
  const claims = useMemo(() => {
    const raw =
      content.type === "COVER_LETTER"
        ? content.paragraphs
        : content.type === "RESUME"
          ? [
              ...content.summary,
              ...content.experience.flatMap((role) => role.bullets),
              ...content.skills,
              ...content.education,
              ...content.credentials,
            ]
          : [];
    return visibleItems(raw, (claim) => claim.text);
  }, [content]);
  return (
    <form action={action} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="assetId" value={asset.id} />
      <input type="hidden" name="contentJson" value={JSON.stringify(content)} />
      {claims.map((claim) => (
        <label key={claim.id} className="block text-sm">
          <span className="font-medium text-slate-700">
            {formatClaimEditorLabel(claim.text)}
          </span>
          <textarea
            id={`claim-edit-${claim.id}`}
            value={claim.text}
            rows={3}
            onChange={(event) =>
              setContent((current) =>
                mapClaimText(current, claim.id, event.target.value),
              )
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
          {flagFor(asset.claimFlags, claim.id) ? (
            <ClaimFlagActions
              campaignId={campaignId}
              assetId={asset.id}
              flag={flagFor(asset.claimFlags, claim.id)!}
            />
          ) : null}
        </label>
      ))}
      <SubmitButton>{applicationAssetConfig.labels.saveNewVersion}</SubmitButton>
      <Status result={result} />
    </form>
  );
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
  return (
    <div className="space-y-3">
      {rows.map((asset, index) => (
        <details
          key={asset.id}
          open={index === 0}
          className="rounded-md border border-slate-200 p-4"
        >
          <summary className="cursor-pointer text-sm font-medium">
            Version {asset.version} · {formatAssetStatusLabel(asset.status)} ·{" "}
            {new Date(asset.createdAt).toLocaleString()}
          </summary>
          <div className="mt-4 space-y-4">
            <AssetPreview
              content={asset.content}
              earlierExperienceHeading={earlierExperienceHeading}
              flags={asset.claimFlags}
              campaignId={campaignId}
              assetId={asset.id}
            />
            {asset.guidance ? (
              <p className="text-xs text-slate-500">
                {applicationAssetConfig.labels.changeInstruction} {asset.guidance}
              </p>
            ) : null}
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
            {canEdit && index === 0 ? (
              <AssetEditor campaignId={campaignId} asset={asset} />
            ) : null}
          </div>
        </details>
      ))}
      <Status result={approveResult} profileHref={profileHref} />
    </div>
  );
}

function PlanPanel({
  campaignId,
  type,
  plan,
  canEdit,
}: {
  campaignId: string;
  type: "RESUME" | "COVER_LETTER";
  plan: PlanRow | null;
  canEdit: boolean;
}) {
  const [writeResult, writeAction] = useActionState(writePresentationPlanAction, initial);
  const [acceptResult, acceptAction] = useActionState(acceptPresentationPlanAction, initial);
  return (
    <div className="space-y-3" data-testid={`${type.toLowerCase()}-plan`}>
      {plan ? (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          {plan.plan.type === "RESUME" ? (
            <>
              <p className="text-sm text-slate-800">{plan.plan.summaryAngle}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
                {visibleItems(
                  plan.plan.recommendations,
                  (item) => `${item.text} ${item.reason}`,
                ).map((item) => (
                  <li key={`${item.text}-${item.reason}`}>
                    {item.text} {item.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-800">{plan.plan.angle}</p>
              <p className="text-sm text-slate-800">{plan.plan.gapHandling}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
                {visibleItems(
                  plan.plan.recommendations,
                  (item) => `${item.text} ${item.reason}`,
                ).map((item) => (
                  <li key={`${item.text}-${item.reason}`}>
                    {item.text} {item.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
      {canEdit && !plan ? (
        <form action={writeAction} className="space-y-2">
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="type" value={type} />
          <SubmitButton>{applicationAssetConfig.labels.writePlan}</SubmitButton>
          <Status result={writeResult} errorsOnly />
        </form>
      ) : null}
      {canEdit && plan?.status === "DRAFT" ? (
        <div className="space-y-3">
          <form action={acceptAction}>
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="type" value={type} />
            <SubmitButton>{applicationAssetConfig.labels.acceptPlan}</SubmitButton>
          </form>
          <form action={writeAction} className="space-y-2">
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="type" value={type} />
            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                {applicationAssetConfig.labels.adjustPlanPrompt}
              </span>
              <textarea
                name="adjustmentNote"
                required
                rows={2}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <SubmitButton>{applicationAssetConfig.labels.adjustPlan}</SubmitButton>
          </form>
          <Status result={acceptResult} />
          <Status result={writeResult} errorsOnly />
        </div>
      ) : null}
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
}) {
  const [result, action] = useActionState(generateApplicationAssetAction, initial);
  const latestResume =
    type === "RESUME" && rows[0]?.content.type === "RESUME"
      ? rows[0].content
      : null;
  const accepted = plan?.status === "ACCEPTED";
  const earlierExperienceHeading =
    plan?.plan.type === "RESUME" ? plan.plan.earlierExperienceHeading : null;
  return (
    <section className={`space-y-4 rounded-md border border-slate-200 p-4 ${WORKSPACE_CARD_WRAP_CLASS}`}>
        <h3 className="font-semibold text-slate-900">
          {type === "RESUME"
            ? applicationAssetConfig.labels.resume
            : applicationAssetConfig.labels.coverLetter}
        </h3>
        {type === "RESUME" && missingContacts.length > 0 ? (
          <p className={`text-sm text-amber-900 ${WORKSPACE_MESSAGE_WRAP_CLASS}`} data-testid="resume-missing-contact">
            {applicationAssetConfig.missingContact.heading}: {missingContacts.join(", ")}.{" "}
            {profileHref ? (
              <AppActionLink href={profileHref} variant="chip">
                {vocab.product.Singular}
              </AppActionLink>
            ) : null}{" "}
            {applicationAssetConfig.missingContact.addInProfile}
          </p>
        ) : null}
        {type === "COVER_LETTER" && thinNotice ? (
          <p className="text-sm text-slate-600" data-testid="cover-letter-thin-evidence">
            {thinNotice}
          </p>
        ) : null}
      {planError ? (
        <p className="text-sm text-red-700" role="status">
          {planError}
        </p>
      ) : null}
      <PlanPanel campaignId={campaignId} type={type} plan={plan} canEdit={canEdit} />
      {canEdit && accepted ? <form action={action} className="space-y-3">
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="type" value={type} />
        {type === "RESUME" ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              {applicationAssetConfig.labels.adjustManually}
            </summary>
            <fieldset className="mt-2">
              <legend className="text-sm font-medium">
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
        {rows.length ? (
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              {applicationAssetConfig.labels.changeInstruction}
            </span>
            <textarea
              name="regenerationInstruction"
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
        ) : null}
        <SubmitButton>
          {rows.length
            ? applicationAssetConfig.labels.regenerate
            : applicationAssetConfig.labels.generate}
        </SubmitButton>
        <Status
          result={result}
          errorsOnly
          profileHref={profileHref}
        />
      </form> : null}
      {rows.length ? (
        <AssetHistory
          campaignId={campaignId}
          rows={rows}
          canEdit={canEdit}
          earlierExperienceHeading={earlierExperienceHeading}
          profileHref={profileHref}
        />
      ) : (
        <p className="text-sm text-slate-600">
          {applicationAssetConfig.labels.emptyHistory}
        </p>
      )}
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
  defaultOpen = false,
}: {
  campaignId: string;
  assets: Array<
    Omit<AssetRow, "content" | "claimFlags"> & {
      content: unknown;
      claimFlagsJson?: unknown;
    }
  >;
  profileRoles: ProfileRole[];
  plans: PlanRow[];
  invalidPlanTypes?: Array<"RESUME" | "COVER_LETTER">;
  canEdit: boolean;
  coverLetterThinNotice?: string | null;
  missingResumeContacts?: string[];
  profileHref?: string | null;
  defaultOpen?: boolean;
}) {
  const valid = assets.flatMap((asset) => {
    const parsed = applicationAssetContentSchema.safeParse(asset.content);
    if (parsed.success) {
      return [
        {
          ...asset,
          content: sanitizeAssetContent(parsed.data),
          claimFlags: openClaimFlags(claimFlagsFromJson(asset.claimFlagsJson)),
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
                claimFlags: openClaimFlags(
                  claimFlagsFromJson(asset.claimFlagsJson),
                ),
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
      className={`space-y-4 rounded-lg border border-slate-200 bg-white p-5 ${WORKSPACE_CARD_WRAP_CLASS}`}
      data-testid="application-assets"
    >
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        {applicationAssetConfig.labels.sectionTitle}
      </summary>
      <div className="mt-4 space-y-4">
      <p className="text-sm text-slate-600">
        {applicationAssetConfig.labels.sectionHelp}
      </p>
      <div className="grid gap-5 xl:grid-cols-2">
        {(["RESUME", "COVER_LETTER"] as const).map((type) => (
          <AssetTypePanel
            key={type}
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
            thinNotice={type === "COVER_LETTER" ? coverLetterThinNotice : null}
            missingContacts={type === "RESUME" ? missingResumeContacts : []}
            profileHref={profileHref}
          />
        ))}
      </div>
      </div>
    </details>
  );
}
