import type { Metadata } from "next";
import Link from "next/link";
import { ApplicationOverview } from "@/components/ApplicationOverview";
import { ApplicationWorkspace } from "@/components/ApplicationWorkspace";
import { generateApplicationPageMetadata } from "@/lib/application/page-metadata";
import { getApplicationOverview } from "@/lib/application/overview";
import { notFound } from "next/navigation";
import { deleteCampaignAction, archiveCampaignAction, unarchiveCampaignAction } from "@/app/actions";
import { CampaignContactsManager } from "@/components/CampaignContactsManager";
import { CampaignEmailSettingsForm } from "@/components/CampaignEmailSettingsForm";
import { CampaignOfferForm } from "@/components/CampaignOfferForm";
import { CampaignVisibilityButton } from "@/components/CampaignVisibilityButton";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { UnarchiveForm } from "@/components/UnarchiveForm";
import { EmailDraftsStage } from "@/components/EmailDraftsStage";
import { CampaignStageShell } from "@/components/CampaignStageShell";
import { CampaignStageRail } from "@/components/CampaignStageRail";
import { QualificationBuckets } from "@/components/QualificationBuckets";
import { PageHeader, Panel, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { campaignDeleteConfirmBody } from "@/lib/tenant/campaign-delete";
import { campaignArchiveConfirmBody } from "@/lib/tenant/campaign-archive";
import {
  contactMatchesSuppressionSet,
  listActiveNormalizedEmails,
} from "@/lib/suppression/service";
import {
  getCampaignDetail,
  getCampaignQualificationView,
  listCompatibleScoringRuns,
  searchAvailableCampaignContacts,
} from "@/lib/campaign/contacts";
import {
  canEditCampaignTemplate,
  canOpenCampaignDetail,
  canSetShared,
  canViewAllCampaigns,
} from "@/lib/campaign/visibility";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { TenantError } from "@/lib/tenant/errors";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { cn, contactDisplayName, formatDate } from "@/lib/utils";
import { claimConflictsFromJson } from "@/lib/email-generation/claim-conflicts";
import { requireCurrentUser } from "@/lib/auth/session";
import { getEffectiveUsagePolicy } from "@/lib/usage/policy";
import { getMailboxConnectionView } from "@/lib/mailbox/data";
import { getDailyEmailSendUsage } from "@/lib/usage/quota";
import { getActiveEmailSignatureBody } from "@/lib/signature/signature";
import { listVoiceSamplesForUser } from "@/lib/voice/samples";
import {
  buildCampaignStages,
  resolveCampaignStage,
} from "@/lib/workflow/campaign-stages";
import { parseEmailLength } from "@/lib/campaign/save";
import { campaignPersonasDisplayName } from "@/lib/campaign/personas";
import { loadEmailDraftScreenStates } from "@/lib/email-generation/context";
import { emailDraftStaleness } from "@/lib/email-generation/draft-staleness";
import {
  listIndexHref,
} from "@/lib/lists/campaign-query";
import { prisma } from "@/lib/prisma";
import { anyListFeatureEnabled, nounForCount, polishCopy, vocab } from "@/lib/product-config";
import { requireGatedPage } from "@/lib/product-config/feature-access";
import { mergeExistingHiringTeamRoles } from "@/lib/hiring-team/merge-existing";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    q?: string;
    stage?: string;
    contact?: string;
    scoringRun?: string;
    attached?: string;
  }>;
};

function asPersonalizationTier(
  value: string | null | undefined,
): "BEST" | "COMPANY" | "THIN" | null {
  if (value === "BEST" || value === "COMPANY" || value === "THIN") return value;
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return generateApplicationPageMetadata(id, "overview");
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-subtle">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-ink">
        {value || "—"}
      </dd>
    </div>
  );
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: PageProps) {
  const organization = await getCurrentOrganization();
  const user = await requireCurrentUser();
  const { id } = await params;
  const query = await searchParams;
  const requestedStage = query.stage?.trim();
  if (requestedStage === "emails" || requestedStage === "send") {
    requireGatedPage("legacyEmailSequence");
  }
  if (
    requestedStage === "setup" ||
    requestedStage === "list" ||
    requestedStage === "companies" ||
    requestedStage === "contacts" ||
    requestedStage === "report"
  ) {
    requireGatedPage("lists");
  }

  if (!organization) {
    return (
      <div>
        <PageHeader title={vocab.campaign.Singular} description={`${vocab.campaign.Singular} details.`} />
        <TenantMissing />
      </div>
    );
  }

  let campaign: Awaited<ReturnType<typeof getCampaignDetail>>;
  let availableContacts: Awaited<
    ReturnType<typeof searchAvailableCampaignContacts>
  >;
  let scoringRuns: Awaited<ReturnType<typeof listCompatibleScoringRuns>>;
  let usagePolicy: Awaited<ReturnType<typeof getEffectiveUsagePolicy>>;
  let mailboxConnection: Awaited<ReturnType<typeof getMailboxConnectionView>>;
  let dailySendUsage: Awaited<ReturnType<typeof getDailyEmailSendUsage>>;
  let qualification: Awaited<ReturnType<typeof getCampaignQualificationView>>;
  let voiceSamples: Awaited<ReturnType<typeof listVoiceSamplesForUser>>;
  let emailSignature: Awaited<ReturnType<typeof getActiveEmailSignatureBody>>;
  try {
    await mergeExistingHiringTeamRoles({
      organizationId: organization.id,
      campaignId: id,
    });
    [
      campaign,
      availableContacts,
      scoringRuns,
      usagePolicy,
      mailboxConnection,
      dailySendUsage,
      qualification,
      voiceSamples,
      emailSignature,
    ] = await Promise.all([
      getCampaignDetail(id),
      searchAvailableCampaignContacts(id, query.q),
      listCompatibleScoringRuns(id),
      getEffectiveUsagePolicy({
        organizationId: organization.id,
        userId: user.id,
      }),
      getMailboxConnectionView({
        organizationId: organization.id,
        userId: user.id,
      }),
      getDailyEmailSendUsage({
        organizationId: organization.id,
        userId: user.id,
      }),
      getCampaignQualificationView(id),
      listVoiceSamplesForUser({
        organizationId: organization.id,
        userId: user.id,
      }),
      getActiveEmailSignatureBody({
        organizationId: organization.id,
        userId: user.id,
      }),
    ]);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const membershipCtx = await getMembershipForCurrentUser(organization.id);
  if (
    !canOpenCampaignDetail({
      role: membershipCtx.membership.role,
      userId: user.id,
      campaign,
    })
  ) {
    notFound();
  }
  const canEditTemplate = canEditCampaignTemplate({
    userId: user.id,
    role: membershipCtx.membership.role,
    campaign,
  });
  const canShare = canSetShared(membershipCtx.membership.role);
  const managerView = canViewAllCampaigns(membershipCtx.membership.role);

  // Shared templates expose setup, never another rep's contacts.
  const scopedContacts =
    campaign.visibility === "SHARED" &&
    campaign.ownerUserId !== user.id &&
    !managerView &&
    !canEditTemplate
      ? []
      : campaign.contacts;
  campaign = { ...campaign, contacts: scopedContacts };

  const campaignArchived = campaign.archivedAt != null;
  const suppressedEmails = await listActiveNormalizedEmails(
    organization.id,
    campaign.contacts.map((entry) => entry.contact.email),
  );

  const draftScreens = await loadEmailDraftScreenStates({
    organizationId: organization.id,
    productId: campaign.productId,
    icpId: campaign.icpId,
    campaignPersonaId: campaign.personaId,
    campaignPersonaName: campaign.persona?.name ?? null,
    inPlay: campaign.personasInPlay
      .filter((row) => row.persona.campaignId === campaign.id)
      .map((row) => ({
        personaId: row.personaId,
        name: row.persona.name,
      })),
    productPersonas: campaign.hiringTeamRoles,
    contacts: campaign.contacts.map((entry) => ({
      campaignContactId: entry.id,
      contactId: entry.contact.id,
      companyId: entry.contact.companyId,
      chosenPersonaId: entry.chosenPersonaId,
      storedPersonaId:
        [...entry.emailDrafts]
          .reverse()
          .find((draft) => draft.personaId)?.personaId ?? null,
    })),
  });

  const companyIds = [
    ...new Set(
      campaign.contacts
        .map((entry) => entry.contact.companyId)
        .filter((companyId): companyId is string => Boolean(companyId)),
    ),
  ];
  const companyResearchRows =
    companyIds.length > 0
      ? await prisma.companyResearch.findMany({
          where: {
            organizationId: organization.id,
            companyId: { in: companyIds },
            researchedAt: { not: null },
          },
          orderBy: { researchedAt: "desc" },
          select: { companyId: true, researchedAt: true },
        })
      : [];
  const companyResearchUpdatedAtByCompanyId = new Map<string, string>();
  for (const row of companyResearchRows) {
    if (!row.companyId || !row.researchedAt) continue;
    if (!companyResearchUpdatedAtByCompanyId.has(row.companyId)) {
      companyResearchUpdatedAtByCompanyId.set(
        row.companyId,
        row.researchedAt.toISOString(),
      );
    }
  }

  const personaUpdatedAtById = new Map<string, string>();
  for (const persona of campaign.hiringTeamRoles) {
    personaUpdatedAtById.set(persona.id, persona.updatedAt.toISOString());
  }
  const productUpdatedAt = campaign.product.updatedAt.toISOString();

  const offerName = campaign.offerName ?? campaign.offer?.name ?? null;
  const offerDescription =
    campaign.offerDescription ?? campaign.offer?.description ?? null;
  const offerCta = campaign.offerCta ?? campaign.offer?.primaryCta ?? null;
  const offerNotes = campaign.offerNotes ?? campaign.offer?.notes ?? null;
  const offer = {
    offerName,
    offerDescription,
    offerCta,
    offerNotes,
  };
  const generatedEmailCount = campaign.contacts.reduce(
    (total, entry) => total + entry.emailDrafts.length,
    0,
  );
  const sentEmailCount = campaign.contacts.reduce(
    (total, entry) =>
      total +
      entry.emailDrafts.filter((draft) => draft.status === "SENT").length,
    0,
  );
  const attachedContactIds = new Set(
    campaign.contacts.map((entry) => entry.contact.id),
  );
  const attachedCompanyIds = new Set(
    campaign.contacts
      .map((entry) => entry.contact.companyId)
      .filter((value): value is string => Boolean(value)),
  );
  const attachedCompanyNames = new Set(
    campaign.contacts
      .map((entry) => entry.contact.company?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );
  const campaignCompanyRows = qualification.companyRows.filter((row) =>
    row.canOverride
      ? attachedCompanyIds.has(row.id)
      : attachedCompanyNames.has(row.name.trim().toLowerCase()),
  );
  const campaignContactRows = qualification.contactRows.filter((row) =>
    attachedContactIds.has(row.id),
  );
  const excludedCompanyIds = new Set(
    campaignCompanyRows
      .filter((row) => row.bucket === "EXCLUDED" && row.canOverride)
      .map((row) => row.id),
  );
  const survivingContactRows = campaignContactRows.filter(
    (row) => !row.companyId || !excludedCompanyIds.has(row.companyId),
  );
  const qualifiedContactCount = survivingContactRows.filter(
    (row) => row.bucket === "GOOD",
  ).length;
  const personasLabel = campaignPersonasDisplayName({
    fallbackPersonaName: campaign.hiringTeamRoles.some(
      (persona) => persona.id === campaign.persona?.id,
    )
      ? campaign.persona?.name
      : null,
    inPlayNames: campaign.personasInPlay
      .filter((row) => row.persona.campaignId === campaign.id)
      .map((row) => row.persona.name),
    productPersonaCount: campaign.hiringTeamRoles.length,
  });
  // Product + ICP are set at create time. Offer is optional — saving an empty
  // offer succeeds, and List must unlock without one.
  const setupComplete = Boolean(campaign.productId && campaign.icpId);
  const stages = buildCampaignStages({
    setupComplete,
    hasListData: campaign.contacts.length > 0,
    companyResultCount: campaignCompanyRows.length,
    survivingCompanyCount: campaignCompanyRows.filter(
      (row) => row.bucket === "GOOD",
    ).length,
    qualifiedContactCount,
    generatedEmailCount,
    sentEmailCount,
  });
  const currentStage = resolveCampaignStage(query.stage, stages);
  const selectedScoringRunId = query.scoringRun?.trim() || null;
  const bucketByContactId = new Map(
    campaignContactRows.map((row) => [row.id, row.bucket]),
  );
  const stageContacts = campaign.contacts;
  const companyCount = new Set(
    campaign.contacts
      .map((entry) => entry.contact.company?.trim().toLowerCase())
      .filter(Boolean),
  ).size;
  const qualifiedCompanyCount = campaignCompanyRows.filter(
    (row) => row.bucket === "GOOD",
  ).length;
  const sequencePositionsReached = campaign.contacts.reduce(
    (maximum, entry) =>
      Math.max(
        maximum,
        ...entry.emailDrafts
          .filter((draft) => draft.status === "SENT")
          .map((draft) => draft.sequenceNumber),
      ),
    0,
  );

  const setupNext =
    campaignArchived
      ? null
      : {
          title: `Next: attach ${vocab.list.aSingular}`,
          body: `An offer is optional. When setup looks right, move to ${vocab.list.Singular} to research, score, and add ${vocab.contact.plural}.`,
          href: `/campaigns/${campaign.id}?stage=list`,
          label: `Continue to ${vocab.list.Singular}`,
        };

  const listNext = campaignArchived
    ? null
    : campaign.contacts.length === 0
      ? {
          title:
            scoringRuns.length === 0
              ? `Next: research and score ${vocab.list.aSingular}`
              : `Next: add ${vocab.contact.plural} from a scored run`,
          body:
            scoringRuns.length === 0
              ? `Open ${vocab.list.Plural}, research companies, score against this ${vocab.campaign.singular}’s ${vocab.product.Singular} / ${vocab.icp.singular} / ${vocab.persona.Singular}, then save and return from the score report.`
              : `Pick a completed scoring run below, or search for individual ${vocab.contact.plural}. After ${vocab.contact.plural} are attached, continue to Companies.`,
          href:
            scoringRuns.length === 0 ? "/lists" : `#campaign-scored-run-form`,
          label:
            scoringRuns.length === 0
              ? `Go to ${vocab.list.Plural} to score`
              : "Jump to scored runs",
        }
      : {
          title: "Next: review companies",
          body: `${campaign.contacts.length} ${vocab.contact.singular}(s) are on this ${vocab.campaign.singular}. Qualify companies against the ${vocab.campaign.singular} ${vocab.icp.singular} before drafting email.`,
          href: `/campaigns/${campaign.id}?stage=companies`,
          label: "Continue to Companies",
        };

  const companiesNext =
    campaignCompanyRows.length === 0
      ? {
          title: `Next: attach a scored ${vocab.list.singular}`,
          body: `Company qualification appears after ${vocab.contact.plural} from a scored run are on this ${vocab.campaign.singular}.`,
          href: `/campaigns/${campaign.id}?stage=list`,
          label: `Back to ${vocab.list.Singular}`,
        }
      : campaignCompanyRows.some((row) => row.bucket === "GOOD")
        ? {
            title: `Next: review ${vocab.contact.plural}`,
            body: `Companies in Good keep their ${vocab.contact.plural} in play. Open ${vocab.contact.Plural} to restore or confirm exclusions.`,
            href: `/campaigns/${campaign.id}?stage=contacts`,
            label: `Continue to ${vocab.contact.Plural}`,
          }
        : null;

  const contactsNext =
    campaignContactRows.length === 0
      ? {
          title: "Next: qualify companies first",
          body: `${vocab.contact.Singular} qualification unlocks after at least one company is in Good.`,
          href: `/campaigns/${campaign.id}?stage=companies`,
          label: "Back to Companies",
        }
      : qualifiedContactCount > 0
        ? {
            title: "Next: write emails",
            body: `Qualified ${vocab.contact.plural} are ready for drafts. Generate, edit, and send from the Emails stage.`,
            href: `/campaigns/${campaign.id}?stage=emails`,
            label: "Continue to Emails",
          }
        : null;

  const emailsNext =
    stageContacts.length === 0
      ? {
          title: `Next: attach ${vocab.contact.plural}`,
          body: `No ${vocab.contact.plural} on this ${vocab.campaign.singular} yet. Go to ${vocab.list.Singular}, add a scored run, then return here to write drafts.`,
          href: `/campaigns/${campaign.id}?stage=list`,
          label: `Go to ${vocab.list.Singular}`,
        }
      : sentEmailCount > 0
        ? {
            title: "Next: review the report",
            body: `After sends land, the Report stage summarizes activity across this ${vocab.campaign.singular}.`,
            href: `/campaigns/${campaign.id}?stage=report`,
            label: "Open Report",
          }
        : null;

  const reportNext =
    generatedEmailCount === 0 && sentEmailCount === 0
      ? {
          title: "Next: start emailing",
          body: `No ${vocab.campaign.singular} activity has been recorded yet. Generate and send from Emails.`,
          href: `/campaigns/${campaign.id}?stage=emails`,
          label: "Go to Emails",
        }
      : null;

  const overview = await getApplicationOverview({
    organizationId: organization.id,
    campaignId: campaign.id,
  });
  if (!overview) {
    throw new Error("Application overview could not be loaded.");
  }

  return (
    <div className="space-y-6">
      <ApplicationOverview view={overview} />
      <ApplicationWorkspace
        campaignId={campaign.id}
        organizationId={organization.id}
        canEdit={canEditTemplate && !campaignArchived}
        focus="overview"
      />
      {anyListFeatureEnabled() ? (
      <PageHeader
        title={campaign.name}
        description={`Stage ${stages.find((stage) => stage.key === currentStage)?.number}: ${stages.find((stage) => stage.key === currentStage)?.label}`}
        actions={
          <>
            {canShare && canEditTemplate && !campaignArchived ? (
              <CampaignVisibilityButton
                campaignId={campaign.id}
                visibility={campaign.visibility}
              />
            ) : null}
            <Link
              href="/campaigns"
              className={SECONDARY_BUTTON_CLASS}
            >
              Back to {vocab.campaign.plural}
            </Link>
            {canEditTemplate && campaignArchived ? (
              <UnarchiveForm
                action={unarchiveCampaignAction}
                id={campaign.id}
                label={`Unarchive ${vocab.campaign.singular}`}
              />
            ) : canEditTemplate ? (
              <ConfirmDeleteForm
                action={archiveCampaignAction}
                hiddenFields={{ id: campaign.id }}
                triggerLabel={`Archive ${vocab.campaign.singular}`}
                confirmTitle={`Archive ${vocab.campaign.singular} "${campaign.name}"?`}
                confirmBody={campaignArchiveConfirmBody()}
                confirmButtonLabel={`Archive ${vocab.campaign.singular}`}
                tone="warning"
                pendingLabel="Archiving…"
              />
            ) : null}
            {canEditTemplate ? (
              <ConfirmDeleteForm
                action={deleteCampaignAction}
                hiddenFields={{ id: campaign.id }}
                triggerLabel={`Delete ${vocab.campaign.singular}`}
                confirmTitle={`Delete ${vocab.campaign.singular} "${campaign.name}"?`}
                confirmBody={campaignDeleteConfirmBody({
                  contactCount: campaign.contacts.length,
                  draftCount: generatedEmailCount,
                  sentCount: sentEmailCount,
                })}
                confirmButtonLabel={`Delete ${vocab.campaign.singular}`}
                onSuccessNavigate="/campaigns"
              />
            ) : (
              <span className="self-center text-sm font-medium text-muted">
                Read-only · owned by {campaign.owner?.name?.trim() || campaign.owner?.email}
              </span>
            )}
          </>
        }
      />
      ) : (
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/campaigns" className={SECONDARY_BUTTON_CLASS}>
          {polishCopy.backToApplications}
        </Link>
        {canEditTemplate && campaignArchived ? (
          <UnarchiveForm
            action={unarchiveCampaignAction}
            id={campaign.id}
            label={`Unarchive ${vocab.campaign.singular}`}
          />
        ) : canEditTemplate ? (
          <ConfirmDeleteForm
            action={archiveCampaignAction}
            hiddenFields={{ id: campaign.id }}
            triggerLabel={`Archive ${vocab.campaign.singular}`}
            confirmTitle={`Archive ${vocab.campaign.singular} "${campaign.name}"?`}
            confirmBody={campaignArchiveConfirmBody()}
            confirmButtonLabel={`Archive ${vocab.campaign.singular}`}
            tone="warning"
            pendingLabel="Archiving…"
          />
        ) : null}
        {canEditTemplate ? (
          <ConfirmDeleteForm
            action={deleteCampaignAction}
            hiddenFields={{ id: campaign.id }}
            triggerLabel={`Delete ${vocab.campaign.singular}`}
            confirmTitle={`Delete ${vocab.campaign.singular} "${campaign.name}"?`}
            confirmBody={campaignDeleteConfirmBody({
              contactCount: campaign.contacts.length,
              draftCount: generatedEmailCount,
              sentCount: sentEmailCount,
            })}
            confirmButtonLabel={`Delete ${vocab.campaign.singular}`}
            onSuccessNavigate="/campaigns"
          />
        ) : null}
      </div>
      )}
      {campaignArchived ? (
        <div className="rounded-md border border-warning bg-warning-tint px-4 py-3 text-sm text-warning">
          This {vocab.campaign.singular} is archived. History is intact. Unarchive it to generate
          emails or change {vocab.contact.plural}.
        </div>
      ) : null}
      {query.attached != null && query.attached !== "" ? (
        <div
          role="status"
          data-testid="scoring-attach-status"
          className="rounded-md border border-success bg-success-tint px-4 py-3 text-sm text-success"
        >
          {Number.parseInt(query.attached, 10) > 0
            ? `${query.attached} Ready to include ${nounForCount(Number(query.attached), vocab.contact)} attached from the scoring run.`
            : `No Ready to include ${vocab.contact.plural} to attach from that scoring run. Check before including and Left out stay on the score report.`}
        </div>
      ) : null}
      {anyListFeatureEnabled() ? (
      <CampaignStageRail
        campaignId={campaign.id}
        stages={stages}
        currentStage={currentStage}
      />
      ) : null}

      {anyListFeatureEnabled() && currentStage === "setup" ? (
        <CampaignStageShell next={setupNext}>
          <Panel
            title="4 Setup"
            description={`${vocab.campaign.Singular} selections reuse approved setup records. Existing selections are shown read-only so qualification history is not silently reinterpreted.`}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <span className="font-medium text-ink">
                  {vocab.campaign.Singular} name
                </span>
                <input
                  value={campaign.name}
                  readOnly
                  className="mt-1 w-full rounded-md border border-edge-strong bg-canvas px-3 py-2"
                />
              </label>
              {[
                [vocab.product.Singular, campaign.product.id, campaign.product.name],
                [vocab.icp.singular, campaign.icp.id, campaign.icp.name],
                [vocab.persona.Plural, "personas-in-play", personasLabel],
                [
                  "Offer",
                  campaign.offer?.id ?? "campaign-offer",
                  offerName ?? "No offer selected (optional)",
                ],
              ].map(([label, value, display]) => (
                <label key={label} className="text-sm">
                  <span className="font-medium text-ink">{label}</span>
                  <select
                    value={value}
                    disabled
                    className="mt-1 w-full rounded-md border border-edge-strong bg-canvas px-3 py-2"
                  >
                    <option value={value}>{display}</option>
                  </select>
                </label>
              ))}
            </div>
          </Panel>
          <Panel title={`${vocab.campaign.Singular} context`}>
            <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Meta label="Status" value={campaign.status} />
              <Meta label={vocab.product.Singular} value={campaign.product.name} />
              <Meta label={vocab.icp.singular} value={campaign.icp.name} />
              <Meta label={`${vocab.persona.Plural} in play`} value={personasLabel} />
              <Meta label="Offer" value={offerName ?? "None (optional)"} />
              <Meta label="Call to action" value={offerCta} />
              <Meta label="Offer description" value={offerDescription} />
              <Meta label="Offer notes" value={offerNotes} />
            </dl>
          </Panel>

          <Panel
            title={`${vocab.campaign.Singular} offer`}
            description={`Optional. Used in email copy when present. Leave blank and continue to ${vocab.list.Singular} if you do not have an offer yet.`}
          >
            {campaignArchived ? (
              <p className="text-sm text-muted">
                Offer settings are read-only while this {vocab.campaign.singular} is archived.
              </p>
            ) : !canEditTemplate ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Shared {vocab.campaign.singular} template is read-only. Use this {vocab.campaign.singular}
                  from the {vocab.campaign.singular} list to create a personal copy.
                </p>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Meta label="Offer" value={offerName} />
                  <Meta label="Call to action" value={offerCta} />
                  <Meta label="Offer description" value={offerDescription} />
                  <Meta label="Offer notes" value={offerNotes} />
                </dl>
              </div>
            ) : (
              <CampaignOfferForm
                campaignId={campaign.id}
                offer={offer}
              />
            )}
          </Panel>

          <Panel
            title={`${vocab.campaign.Singular} guidance`}
            description={`Default length and ${vocab.campaign.singular}-specific guidance for generated materials.`}
          >
            {campaignArchived ? (
              <p className="text-sm text-muted">
                Email settings are read-only while this {vocab.campaign.singular} is archived.
              </p>
            ) : !canEditTemplate ? (
              <dl className="grid gap-3 sm:grid-cols-2">
                <Meta
                  label="Default email length"
                  value={campaign.emailLength}
                />
                <Meta
                  label="Email guidance"
                  value={campaign.emailGuidance}
                />
              </dl>
            ) : (
              <CampaignEmailSettingsForm
                campaignId={campaign.id}
                emailLength={campaign.emailLength}
                emailGuidance={campaign.emailGuidance}
              />
            )}
          </Panel>
        </CampaignStageShell>
      ) : null}

      {anyListFeatureEnabled() && currentStage === "emails" ? (
        <CampaignStageShell next={emailsNext}>
        <Panel
          title={`Emails (${stageContacts.length} ${vocab.contact.plural})`}
          description={`Generate, edit, and send drafts for every ${vocab.contact.singular} in this ${vocab.campaign.singular}. Use Compare drafts to review several at once.`}
        >
          <div className="mb-4 space-y-3 rounded-md border border-edge bg-canvas p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">
                  {vocab.campaign.Singular} guidance
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Default length and {vocab.campaign.singular}-specific guidance. Length can be
                  overridden on each draft.
                </p>
              </div>
              <Link
                href={`/campaigns/${campaign.id}?stage=setup`}
                className="text-xs font-medium text-ink underline underline-offset-2"
              >
                Also on Setup
              </Link>
            </div>
            {campaignArchived ? (
              <p className="text-sm text-muted">
                Email settings are read-only while this {vocab.campaign.singular} is archived.
              </p>
            ) : !canEditTemplate ? (
              <dl className="grid gap-3 sm:grid-cols-2">
                <Meta
                  label="Default email length"
                  value={campaign.emailLength}
                />
                <Meta
                  label="Email guidance"
                  value={campaign.emailGuidance}
                />
              </dl>
            ) : (
              <CampaignEmailSettingsForm
                campaignId={campaign.id}
                emailLength={campaign.emailLength}
                emailGuidance={campaign.emailGuidance}
              />
            )}
          </div>
          {voiceSamples.length === 0 ? (
            <div className="mb-4 rounded-md border border-warning bg-warning-tint p-4">
              <p className="text-sm font-medium text-warning">
                Add a voice sample before generating your first email.
              </p>
              <Link
                href="/settings/voice"
                className="mt-2 inline-flex text-sm font-medium text-warning underline"
              >
                Set up your voice
              </Link>
            </div>
          ) : null}
          {stageContacts.length > 0 ? (
            <EmailDraftsStage
              campaignEmailLength={campaign.emailLength}
              offerWarnings={[]}
              emailDeeplinkMaxUrlLength={
                usagePolicy.emailDeeplinkMaxUrlLength
              }
              emailSignature={emailSignature}
              mailboxConnection={
                mailboxConnection
                  ? {
                      status: mailboxConnection.status,
                      mailboxAddress: mailboxConnection.mailboxAddress,
                    }
                  : null
              }
              dailySendUsage={{
                used: dailySendUsage.used,
                warningLimit: dailySendUsage.warningLimit,
                limit: dailySendUsage.limit,
              }}
              readOnly={campaignArchived || !canEditTemplate}
              initialCampaignContactId={query.contact}
              contacts={stageContacts.map((campaignContact) => {
                const contact = campaignContact.contact;
                const draftScreen = draftScreens[campaignContact.id];
                return {
                  campaignContactId: campaignContact.id,
                  contactId: contact.id,
                  contactName: contactDisplayName(
                    contact.firstName,
                    contact.lastName,
                  ),
                  contactDetails:
                    [contact.title, contact.company]
                      .filter(Boolean)
                      .join(" · ") || "No role details",
                  contactEmail: contact.email,
                  contactStatus: campaignContact.status,
                  suppressed: contactMatchesSuppressionSet(
                    contact.email,
                    suppressedEmails,
                  ),
                  sequenceStopped: campaignContact.sequenceStoppedAt != null,
                  sequenceStoppedReason:
                    campaignContact.sequenceStoppedReason,
                  qualificationBucket:
                    bucketByContactId.get(contact.id) ?? null,
                  personaOptions: draftScreen?.personaOptions ?? [],
                  resolvedPersonaId: draftScreen?.resolvedPersonaId ?? null,
                  resolvedPersonaName:
                    draftScreen?.resolvedPersonaName ?? null,
                  hasPersonaDecision:
                    draftScreen?.hasPersonaDecision ?? true,
                  needsPersonaConfirmation:
                    draftScreen?.needsPersonaConfirmation ?? false,
                  suggestedPersonaId:
                    draftScreen?.suggestedPersonaId ?? null,
                  suggestedPersonaName:
                    draftScreen?.suggestedPersonaName ?? null,
                  personaDecisionReason:
                    draftScreen?.personaDecisionReason ?? null,
                  personalizationTier:
                    draftScreen?.personalizationTier ?? "THIN",
                  personalizationLabel:
                    draftScreen?.personalizationLabel ??
                    `${vocab.persona.Singular} and ${vocab.product.singular} only`,
                  personalizationDetail:
                    draftScreen?.personalizationDetail ??
                    "No usable company or contact research.",
                  personalizationSources:
                    draftScreen?.personalizationSources ??
                    "No company research available. No contact research available.",
                  drafts: campaignContact.emailDrafts
                    .filter(
                      (draft) =>
                        Boolean(draft.subject) && Boolean(draft.body),
                    )
                    .map((draft) => ({
                      id: draft.id,
                      sequenceNumber: draft.sequenceNumber,
                      subject: draft.subject ?? "",
                      body: draft.body ?? "",
                      status: draft.status,
                      source: draft.source,
                      generationQuotaCommitted: draft.generationQuotaCommitted,
                      kind: draft.kind,
                      sentAt: draft.sentAt?.toISOString() ?? null,
                      handoffAt:
                        draft.sendRecords[0]?.occurredAt.toISOString() ??
                        null,
                      replyClassification: draft.replyClassification,
                      referralSuggested: draft.referralSuggested,
                      emailLength: parseEmailLength(draft.emailLength),
                      personaId: draft.personaId,
                      personalizationTier: asPersonalizationTier(
                        draft.personalizationTier,
                      ),
                      personalizationSources:
                        draft.personalizationSources,
                      claimConflicts: claimConflictsFromJson(
                        draft.claimConflictsJson,
                      ),
                      staleReasons: emailDraftStaleness({
                        draftCreatedAt: draft.createdAt.toISOString(),
                        draftStatus: draft.status,
                        productUpdatedAt,
                        personaUpdatedAt:
                          (draft.personaId
                            ? personaUpdatedAtById.get(draft.personaId)
                            : null) ??
                          (draftScreen?.resolvedPersonaId
                            ? personaUpdatedAtById.get(
                                draftScreen.resolvedPersonaId,
                              )
                            : null) ??
                          null,
                        companyResearchUpdatedAt: contact.companyId
                          ? companyResearchUpdatedAtByCompanyId.get(
                              contact.companyId,
                            ) ?? null
                          : null,
                      }).reasons,
                    })),
                };
              })}
            />
          ) : null}
        </Panel>
        </CampaignStageShell>
      ) : null}

      {anyListFeatureEnabled() && currentStage === "list" ? (
        <CampaignStageShell next={listNext}>
        <Panel
          title={`5 ${vocab.list.Singular}`}
          description={`Get ${vocab.contact.plural} into this ${vocab.campaign.singular}. Research and score ${vocab.list.aSingular} first if you have not already, then add the scored run here.`}
        >
          {campaignArchived || !canEditTemplate ? (
            <div className="space-y-4">
              <div className="flex flex-col items-start gap-2">
                <Link
                  href={listIndexHref({ campaignId: campaign.id })}
                  className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
                >
                  Select an Existing {vocab.list.Singular} To Be Researched and Scored
                </Link>
              </div>
              <p className="text-sm text-muted">
                {campaignArchived
                  ? `${vocab.contact.Plural} cannot be changed while this ${vocab.campaign.singular} is archived.`
                  : `Manager access is read-only. Only the ${vocab.campaign.singular} owner can change ${vocab.contact.plural}.`}
              </p>
            </div>
          ) : (
            <CampaignContactsManager
              campaignId={campaign.id}
              search={query.q?.trim() ?? ""}
              selectedScoringRunId={selectedScoringRunId}
              contacts={availableContacts.map((contact) => ({
                id: contact.id,
                name: contactDisplayName(contact.firstName, contact.lastName),
                email: contact.email,
                title: contact.title,
                company: contact.company,
                listName:
                  contact.contactLists.map((list) => list.name).join(", ") ||
                  "Unlisted",
              }))}
              scoringRuns={scoringRuns.map((run) => ({
                id: run.id,
                listName: run.contactList.name,
                label: run.label,
                status: run.status,
                completedScoreCount: run.completedScoreCount,
                createdLabel: formatDate(run.createdAt),
              }))}
            />
          )}
        </Panel>
        </CampaignStageShell>
      ) : null}

      {anyListFeatureEnabled() && currentStage === "companies" ? (
        <CampaignStageShell next={companiesNext}>
          <Panel
            title="6 Companies"
            description={`Qualification against ${campaign.icp.name}, the ${vocab.campaign.singular} ${vocab.icp.singular} only.`}
          >
            <QualificationBuckets
              campaignId={campaign.id}
              scoringRunId={qualification.scoringRunId}
              rows={campaignCompanyRows}
              emptyTitle="No company qualification results yet"
              emptyActionHref={`/campaigns/${campaign.id}?stage=list`}
              emptyActionLabel="Choose a list"
              readOnly={!canEditTemplate}
            />
          </Panel>
        </CampaignStageShell>
      ) : null}

      {anyListFeatureEnabled() && currentStage === "contacts" ? (
        <CampaignStageShell next={contactsNext}>
          <Panel
            title={`7 ${vocab.contact.Plural}`}
            description={`Review all ${vocab.campaign.singular} ${vocab.contact.plural}, including excluded rows with inline reasoning. Restore ${vocab.contact.plural} individually or in bulk when the exclusion should not apply.`}
          >
            <QualificationBuckets
              campaignId={campaign.id}
              scoringRunId={qualification.scoringRunId}
              rows={campaignContactRows}
              emptyTitle={`No ${vocab.contact.singular} qualification results yet`}
              emptyActionHref={`/campaigns/${campaign.id}?stage=companies`}
              emptyActionLabel="Review companies"
              readOnly={!canEditTemplate}
            />
          </Panel>
        </CampaignStageShell>
      ) : null}

      {anyListFeatureEnabled() && currentStage === "report" ? (
        <CampaignStageShell next={reportNext}>
          <Panel
            title="9 Report"
            description={`Activity across this whole ${vocab.campaign.singular} — companies, ${vocab.contact.plural}, and emails.`}
          >
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Companies added", companyCount],
                ["Companies qualified", qualifiedCompanyCount],
                ["Contacts qualified", qualifiedContactCount],
                ["Emails generated", generatedEmailCount],
                ["Emails sent", sentEmailCount],
                [`${vocab.sequence.Singular} positions reached`, sequencePositionsReached],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-lg border border-edge bg-surface p-4"
                >
                  <dt className="text-sm text-subtle">{label}</dt>
                  <dd className="mt-1 text-2xl font-semibold text-ink">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {generatedEmailCount === 0 && sentEmailCount === 0 ? (
              <div className="mt-5 rounded-md border border-dashed border-edge-strong p-5 text-center">
                <p className="text-sm text-muted">
                  No {vocab.campaign.singular} activity has been recorded yet.
                </p>
              </div>
            ) : null}
          </Panel>
        </CampaignStageShell>
      ) : null}
    </div>
  );
}
