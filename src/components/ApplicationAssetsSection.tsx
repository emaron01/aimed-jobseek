"use client";

import { useActionState, useMemo, useState } from "react";
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
import { formatResumeRoleMeta } from "@/lib/application-assets/dates";
import {
  formatAssetStatusLabel,
  formatClaimEditorLabel,
  formatClaimSupportLabel,
} from "@/lib/application-assets/display";
import { applicationAssetConfig } from "@/lib/product-config";
import { SECONDARY_BUTTON_CLASS, SubmitButton } from "@/components/ui";

type AssetRow = {
  id: string;
  type: "RESUME" | "COVER_LETTER";
  version: number;
  status: "DRAFT" | "APPROVED";
  content: ApplicationAssetContent;
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

const initial: ApplicationAssetActionResult | null = null;

function Status({ result }: { result: ApplicationAssetActionResult | null }) {
  if (!result) return null;
  return (
    <div
      role="status"
      className={result.ok ? "text-sm text-emerald-700" : "text-sm text-red-700"}
    >
      <p>{result.message}</p>
      {result.violations?.length ? (
        <ul className="mt-1 list-disc pl-5">
          {result.violations.map((violation) => (
            <li key={violation}>{violation}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ClaimText({ claim }: { claim: AssetClaim }) {
  const support = claim.supports
    .map((item) => formatClaimSupportLabel(item.sourceId, item.quote))
    .join("\n");
  return (
    <span title={support} tabIndex={0} className="cursor-help underline decoration-dotted">
      {claim.text}
    </span>
  );
}

function AssetPreview({ content }: { content: ApplicationAssetContent }) {
  if (content.type === "COVER_LETTER") {
    return (
      <article className="space-y-4 text-sm leading-6 text-slate-800">
        <p>{content.salutation}</p>
        {content.paragraphs.map((claim) => (
          <p key={claim.id}>
            <ClaimText claim={claim} />
          </p>
        ))}
        <p>
          {content.signoff}
          <br />
          {content.signerName}
        </p>
      </article>
    );
  }
  if (content.type !== "RESUME") return null;
  return (
    <article className="space-y-4 text-sm text-slate-800">
      <header className="text-center">
        <h4 className="text-xl font-semibold">
          <ClaimText claim={content.header.name} />
        </h4>
        <p className="mt-1">
          {content.header.contactDetails.map((claim, index) => (
            <span key={claim.id}>
              {index > 0 ? " | " : ""}
              <ClaimText claim={claim} />
            </span>
          ))}
        </p>
      </header>
      <AssetSection title={applicationAssetConfig.resumeHeadings.summary}>
        {content.summary.map((claim) => (
          <p key={claim.id}>
            <ClaimText claim={claim} />
          </p>
        ))}
      </AssetSection>
      <AssetSection title={applicationAssetConfig.resumeHeadings.experience}>
        {content.experience
          .filter((role) => !role.hidden)
          .map((role) => (
            <div key={role.roleId} className="space-y-1">
              <p className="font-medium">
                {role.title}, {role.employer}
              </p>
              <p className="text-xs text-slate-600">
                {formatResumeRoleMeta(role)}
              </p>
              <ul className="list-disc pl-5">
                {role.bullets.map((claim) => (
                  <li key={claim.id}>
                    <ClaimText claim={claim} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </AssetSection>
      {[
        [applicationAssetConfig.resumeHeadings.skills, content.skills],
        [applicationAssetConfig.resumeHeadings.education, content.education],
        [applicationAssetConfig.resumeHeadings.credentials, content.credentials],
      ].map(([title, claims]) =>
        (claims as AssetClaim[]).length ? (
          <AssetSection key={title as string} title={title as string}>
            {(claims as AssetClaim[]).map((claim) => (
              <p key={claim.id}>
                <ClaimText claim={claim} />
              </p>
            ))}
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
    if (content.type === "COVER_LETTER") return content.paragraphs;
    if (content.type !== "RESUME") return [];
    return [
      ...content.summary,
      ...content.experience.flatMap((role) => role.bullets),
      ...content.skills,
      ...content.education,
      ...content.credentials,
    ];
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
            value={claim.text}
            rows={3}
            onChange={(event) =>
              setContent((current) =>
                mapClaimText(current, claim.id, event.target.value),
              )
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
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
}: {
  campaignId: string;
  rows: AssetRow[];
  canEdit: boolean;
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
            <AssetPreview content={asset.content} />
            {asset.guidance ? (
              <p className="text-xs text-slate-500">
                {applicationAssetConfig.labels.changeInstruction} {asset.guidance}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <a
                className={SECONDARY_BUTTON_CLASS}
                href={`/api/application-assets/${asset.id}/docx`}
              >
                {applicationAssetConfig.labels.downloadDocx}
              </a>
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
      <Status result={approveResult} />
    </div>
  );
}

function AssetTypePanel({
  campaignId,
  type,
  rows,
  profileRoles,
  canEdit,
}: {
  campaignId: string;
  type: "RESUME" | "COVER_LETTER";
  rows: AssetRow[];
  profileRoles: ProfileRole[];
  canEdit: boolean;
}) {
  const [result, action] = useActionState(generateApplicationAssetAction, initial);
  const latestResume =
    type === "RESUME" && rows[0]?.content.type === "RESUME"
      ? rows[0].content
      : null;
  return (
    <section className="space-y-4 rounded-md border border-slate-200 p-4">
      <h3 className="font-semibold text-slate-900">
        {type === "RESUME"
          ? applicationAssetConfig.labels.resume
          : applicationAssetConfig.labels.coverLetter}
      </h3>
      {canEdit ? <form action={action} className="space-y-3">
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="type" value={type} />
        {type === "RESUME" ? (
          <fieldset>
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
        ) : null}
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
        <SubmitButton>
          {rows.length
            ? applicationAssetConfig.labels.regenerate
            : applicationAssetConfig.labels.generate}
        </SubmitButton>
        <Status result={result} />
      </form> : null}
      {rows.length ? (
        <AssetHistory campaignId={campaignId} rows={rows} canEdit={canEdit} />
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
  canEdit,
}: {
  campaignId: string;
  assets: Array<Omit<AssetRow, "content"> & { content: unknown }>;
  profileRoles: ProfileRole[];
  canEdit: boolean;
}) {
  const valid = assets.flatMap((asset) => {
    const parsed = applicationAssetContentSchema.safeParse(asset.content);
    return parsed.success ? [{ ...asset, content: parsed.data }] : [];
  });
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          {applicationAssetConfig.labels.sectionTitle}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {applicationAssetConfig.labels.sectionHelp}
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {(["RESUME", "COVER_LETTER"] as const).map((type) => (
          <AssetTypePanel
            key={type}
            campaignId={campaignId}
            type={type}
            rows={valid.filter((asset) => asset.type === type)}
            profileRoles={profileRoles}
            canEdit={canEdit}
          />
        ))}
      </div>
    </section>
  );
}
