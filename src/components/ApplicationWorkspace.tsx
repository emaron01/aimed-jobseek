import { retryApplicationNextStepAction } from "@/app/actions/application";
import {
  ApplicationWorkspaceLive,
  WorkspaceProgress,
} from "@/components/ApplicationWorkspaceLive";
import { CheatSheetGenerationError } from "@/components/CheatSheetGenerationError";
import { latestApplicationSummaryFailure } from "@/lib/application-summary/failure-message";
import {
  WORKSPACE_CARD_WRAP_CLASS,
  WORKSPACE_MESSAGE_WRAP_CLASS,
  workspaceCampaignSummaryHref,
  workspaceContactEditHref,
} from "@/lib/application/workspace-links";
import { listApplicationContacts } from "@/lib/application/contacts";
import { isHiringTeamPersonaBuilt } from "@/lib/hiring-team/build";
import { AppPendingIndicator } from "@/components/AppButton";
import {
  addTemplateRoleAction,
  moveApplicationRoleInvolvementAction,
  removeApplicationRoleAction,
  saveRoleAsTemplateAction,
  updateApplicationRoleAction,
} from "@/app/actions/hiring-team";
import {
  parseIndividualProfile,
  parseLinkedInExtracted,
} from "@/lib/contact-profile/service";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { InterviewStagesSection } from "@/components/InterviewStagesSection";
import { ApplicationAssetsSection } from "@/components/ApplicationAssetsSection";
import { OpenDetailsOnMount } from "@/components/OpenDetailsOnMount";
import { ApplicationOutreachSection } from "@/components/ApplicationOutreachSections";
import { isOutreachAssetType } from "@/lib/product-config";
import { HiringTeamDisclosureGroup } from "@/components/HiringTeamDisclosureGroup";
import { AddPersonaSection } from "@/components/AddPersonaSection";
import { HiringTeamAssumptionNotice } from "@/components/HiringTeamAssumptionNotice";
import { HiringTeamPersonPicker } from "@/components/HiringTeamPersonPicker";
import { HiringTeamRoleActions } from "@/components/HiringTeamRoleActions";
import {
  HiringTeamCheatSheetToggle,
  HiringTeamRecommendedLine,
  HiringTeamRecommendedMark,
} from "@/components/HiringTeamCheatSheetControls";
import { prisma } from "@/lib/prisma";
import { coverLetterThinEvidenceCopy } from "@/lib/application-assets/service";
import { applicationSummaryConfig, applicationWorkspaceCopy, consultationConversationCopy, hiringTeamConfig, hiringTeamDetailsTitle, outreachConfig, vocab } from "@/lib/product-config";
import { AppActionLink } from "@/components/ui";
import { parseStringArray } from "@/lib/research";
import { contactDisplayName } from "@/lib/utils";
import { missingResumeContactLabels } from "@/lib/application-assets/header";
import {
  ApplicationWorkspaceEmpty,
  type ApplicationWorkspaceFocus,
} from "@/components/ApplicationWorkspaceEmpty";
import {
  ApplicationCompanyBody,
  ApplicationCompanyDetails,
} from "@/components/ApplicationCompanyBody";
import { ApplicationJobBody, ApplicationJobDetails } from "@/components/ApplicationJobBody";
import { loadApplicationWorkspaceModel } from "@/components/application-workspace-model";

export type { ApplicationWorkspaceFocus };

function textList(value: unknown): string[] {
  return parseStringArray(value);
}

function showFocus(
  focus: ApplicationWorkspaceFocus,
  keys: ApplicationWorkspaceFocus[],
): boolean {
  return focus === "all" || keys.includes(focus);
}

export async function ApplicationWorkspace({
  campaignId,
  organizationId,
  canEdit,
  focus = "all",
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
  focus?: ApplicationWorkspaceFocus;
}) {
  if (focus === "job") {
    return (
      <ApplicationJobBody
        campaignId={campaignId}
        organizationId={organizationId}
        canEdit={canEdit}
      />
    );
  }
  if (focus === "company") {
    return (
      <ApplicationCompanyBody
        campaignId={campaignId}
        organizationId={organizationId}
        canEdit={canEdit}
      />
    );
  }
  const loaded = await loadApplicationWorkspaceModel(
    organizationId,
    campaignId,
    canEdit,
    showFocus(focus, ["assets"]),
    focus === "all" || focus === "outreach",
  );
  if (!loaded.requirement) {
    return <ApplicationWorkspaceEmpty focus={focus} />;
  }
  const requirement = loaded.requirement;
  const profile = loaded.profile;
  const statementPicker = loaded.statementPicker;
  const coverLetterEvidenceThin = loaded.coverLetterEvidenceThin;
  const emailSignature = loaded.emailSignature;
  const nextStep = loaded.nextStep;
  const live = loaded.live;
  const profileHref = loaded.profileHref;
  const profileEditHref = loaded.profileEditHref;
  const invalidPlanTypes = loaded.invalidPlanTypes;
  const presentationPlans = loaded.presentationPlans;
  const assetsOpen = loaded.assetsOpen;
  const asPage = focus !== "all";

  return (
    <div className={`space-y-4 ${WORKSPACE_CARD_WRAP_CLASS}`}>
    {showFocus(focus, ["overview"]) ? (
    <section
      className={`space-y-3 rounded-lg border border-edge bg-surface p-5 ${WORKSPACE_CARD_WRAP_CLASS}`}
      data-testid="application-next-step"
    >
      <h2 id="application-next-step" className="text-base font-semibold text-ink">
        {consultationConversationCopy.nextStepTitle}
      </h2>
      <ApplicationWorkspaceLive
        campaignId={campaignId}
        initialJobs={live.jobs}
        profileHref={profileHref}
      />
      <WorkspaceProgress jobs={live.jobs} type="NEXT_STEP" />
      {nextStep.failed ? (
        <div className="space-y-2">
          <p className={`text-sm text-warning ${WORKSPACE_MESSAGE_WRAP_CLASS}`}>
            {consultationConversationCopy.nextStepFailed}
          </p>
          {canEdit ? (
            <ApplicationActionForm
              action={retryApplicationNextStepAction}
              submitLabel={consultationConversationCopy.nextStepRetry}
              testId="retry-next-step"
            >
              <input type="hidden" name="campaignId" value={campaignId} />
            </ApplicationActionForm>
          ) : null}
        </div>
      ) : (
        <p className={`text-sm text-ink ${WORKSPACE_MESSAGE_WRAP_CLASS}`}>{nextStep.text}</p>
      )}
    </section>
    ) : null}
    {showFocus(focus, ["company"]) ? (
    <ApplicationCompanyDetails model={loaded} canEdit={canEdit} asPage={asPage} />
    ) : null}
    {showFocus(focus, ["job"]) ? (
    <ApplicationJobDetails model={loaded} canEdit={canEdit} asPage={asPage} />
    ) : null}
    {showFocus(focus, ["hiring-team"]) ? (
    <HiringTeamSection
      campaignId={requirement.campaignId}
      organizationId={organizationId}
      canEdit={canEdit}
      jobs={live.jobs}
      asPage={asPage}
    />
    ) : null}
    {showFocus(focus, ["assets"]) ? (
    <div id="assets">
    <WorkspaceProgress
      jobs={live.jobs}
      type="RESUME"
      profileHref={profileHref}
    />
    <WorkspaceProgress
      jobs={live.jobs}
      type="COVER_LETTER"
      profileHref={profileHref}
    />
    <ApplicationAssetsSection
      campaignId={requirement.campaignId}
      canEdit={canEdit}
      defaultOpen={assetsOpen}
      plans={presentationPlans}
      invalidPlanTypes={invalidPlanTypes}
      coverLetterThinNotice={
        coverLetterEvidenceThin ? coverLetterThinEvidenceCopy() : null
      }
      missingResumeContacts={
        profile.ok ? missingResumeContactLabels(profile.profile) : []
      }
      profileHref={profileHref}
      profileEditHref={profileEditHref}
      statementGroups={statementPicker.groups}
      statementRoleOptions={statementPicker.roleOptions}
      needsPrepare={statementPicker.needsPrepare}
      assets={requirement.campaign.applicationAssets
        .filter(
          (
            asset,
          ): asset is typeof asset & { type: "RESUME" | "COVER_LETTER" } =>
            asset.type === "RESUME" || asset.type === "COVER_LETTER",
        )
        .map((asset) => ({
          id: asset.id,
          type: asset.type,
          version: asset.version,
          status: asset.status,
          content: asset.contentJson,
          guidance: asset.guidance,
          promptVersion: asset.promptVersion,
          staleReason: asset.staleReason,
          createdAt: asset.createdAt.toISOString(),
        }))}
    />
    </div>
    ) : null}
    {showFocus(focus, ["outreach"]) ? (
    <div id="outreach" data-testid="application-contacts-wrap">
    <p className="sr-only">{applicationWorkspaceCopy.contactsTitle}</p>
    <WorkspaceProgress jobs={live.jobs} type="OUTREACH" />
    <ApplicationOutreachSection
      campaignId={requirement.campaignId}
      canEdit={canEdit}
      approvedResumeId={
        requirement.campaign.applicationAssets.find(
          (asset) => asset.type === "RESUME" && asset.status === "APPROVED",
        )?.id ?? null
      }
      roles={requirement.campaign.hiringTeamRoles.map((role) => ({
        id: role.id,
        name: role.name,
        suggestionKey: role.suggestionKey,
        personaBuilt: isHiringTeamPersonaBuilt(role),
      }))}
      contacts={requirement.campaign.contacts.map(toContactRow)}
      interviewStages={requirement.campaign.interviewStages.map((stage) => {
        const interviewerContactId = stage.interviewers[0]?.contactId ?? null;
        const personaId =
          requirement.campaign.contacts.find(
            (row) => row.contact.id === interviewerContactId,
          )?.chosenPersonaId ?? null;
        return {
          id: stage.id,
          type: stage.type,
          format: stage.format,
          scheduledAt: stage.scheduledAt.toISOString(),
          notesAfter: stage.notesAfter,
          thankYouClarifyJson: stage.thankYouClarifyJson,
          interviewerContactId,
          personaId,
        };
      })}
      assets={requirement.campaign.applicationAssets
        .filter((asset): asset is typeof asset & {
          type: "EMAIL" | "LINKEDIN_CONNECTION_NOTE" | "LINKEDIN_INMAIL";
        } => isOutreachAssetType(asset.type))
        .map((asset) => ({
          id: asset.id,
          type: asset.type,
          version: asset.version,
          status: asset.status,
          personaId: asset.personaId,
          contactId: asset.contactId,
          purpose: asset.purpose,
          sentAt: asset.sentAt?.toISOString() ?? null,
          createdAt: asset.createdAt.toISOString(),
          emailLength: asset.emailLength,
          content: asset.contentJson,
        }))}
      emailSignature={emailSignature}
    />
    </div>
    ) : null}
    {showFocus(focus, ["interviews"]) ? (
    <div id="interviews">
    <WorkspaceProgress jobs={live.jobs} type="APPLICATION_SUMMARY" hideFailure />
    {(() => {
      const guideFailure = latestApplicationSummaryFailure({
        jobs: live.jobs,
        fallback: `${applicationSummaryConfig.title} could not be generated. Retry.`,
      });
      const pageFailure = guideFailure?.sectionKey ? null : guideFailure;
      return (
        <>
          <CheatSheetGenerationError message={pageFailure?.message ?? null} />
          <InterviewStagesSection
            campaignId={requirement.campaignId}
            organizationId={organizationId}
            canEdit={canEdit}
            roles={requirement.campaign.hiringTeamRoles}
            contacts={requirement.campaign.contacts.map((row) => ({
              contactId: row.contact.id,
              personaId: row.chosenPersonaId,
            }))}
            guideFailure={guideFailure}
          />
        </>
      );
    })()}
    </div>
    ) : null}
    {showFocus(focus, ["summary"]) ? (
    <details
      className="rounded-lg border border-edge bg-surface p-5"
      data-testid="application-summary-wrap"
      id="application-summary"
    >
      {asPage ? <OpenDetailsOnMount /> : null}
      <summary className="cursor-pointer text-base font-semibold text-ink">
        {applicationSummaryConfig.title}
      </summary>
      <div className="mt-4 space-y-3">
        <WorkspaceProgress jobs={live.jobs} type="APPLICATION_SUMMARY" />
        <p className="text-sm text-muted">{applicationSummaryConfig.description}</p>
        <AppActionLink href={workspaceCampaignSummaryHref(campaignId)} variant="secondary">
          {applicationSummaryConfig.title}
        </AppActionLink>
      </div>
    </details>
    ) : null}
    </div>
  );
}

function annotatedList(value: unknown): Array<{ text: string; kind: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { text?: unknown; kind?: unknown };
    if (typeof row.text !== "string" || !row.text.trim()) return [];
    return [{ text: row.text.trim(), kind: row.kind === "FACT" ? "FACT" : "INFERENCE" }];
  });
}

function readNarrative(value: unknown): {
  involvement: string | null;
  modelNote: string | null;
  overview: string | null;
  pressures: Array<{ text: string; kind: string }>;
  impact: { text: string; kind: string } | null;
  needs: Array<{ text: string; kind: string }>;
  concerns: Array<{ text: string; kind: string }>;
  interviewStage: { text: string; kind: string } | null;
  evaluates: Array<{ text: string; kind: string }>;
  talkingPoints: Array<{ text: string; kind: string }>;
  communication: Array<{ text: string; kind: string }>;
  identificationEvidence: Array<{ text: string; kind: string }>;
} | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    narrative?: unknown;
    involvement?: unknown;
    identification?: unknown;
    modelNote?: unknown;
  };
  const narrative = row.narrative;
  const body =
    narrative && typeof narrative === "object" ? (narrative as Record<string, unknown>) : null;
  const one = (entry: unknown) => {
    if (!entry || typeof entry !== "object") return null;
    const item = entry as { text?: unknown; kind?: unknown };
    if (typeof item.text !== "string" || !item.text.trim()) return null;
    return { text: item.text.trim(), kind: item.kind === "FACT" ? "FACT" : "INFERENCE" };
  };
  const identification = row.identification;
  const evidence =
    identification && typeof identification === "object" && Array.isArray((identification as { evidence?: unknown }).evidence)
      ? annotatedList(
          (identification as { evidence: unknown[] }).evidence.map((item) => {
            if (!item || typeof item !== "object") return null;
            const claim = item as { claim?: unknown; kind?: unknown };
            return { text: claim.claim, kind: claim.kind };
          }),
        )
      : [];
  return {
    involvement: typeof row.involvement === "string" ? row.involvement : null,
    modelNote: typeof row.modelNote === "string" && row.modelNote.trim() ? row.modelNote.trim() : null,
    overview: body ? (one(body.overview)?.text ?? null) : null,
    pressures: body ? annotatedList(body.pressures) : [],
    impact: body ? one(body.impact) : null,
    needs: body ? annotatedList(body.needs) : [],
    concerns: body ? annotatedList(body.concerns) : [],
    interviewStage: body ? one(body.interviewStage) : null,
    evaluates: body ? annotatedList(body.evaluates) : [],
    talkingPoints: body ? annotatedList(body.talkingPoints) : [],
    communication: body ? annotatedList(body.communication) : [],
    identificationEvidence: evidence,
  };
}

function toContactRow(row: {
  chosenPersonaId: string | null;
  roleConfirmed: boolean;
  linkedInProfileText: string | null;
  linkedInExtractedJson: unknown;
  individualProfileJson: unknown;
  individualProfileStatus: string | null;
  individualProfileError: string | null;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    email: string | null;
    linkedinUrl: string | null;
  };
  chosenPersona: { name: string } | null;
}) {
  const extracted = parseLinkedInExtracted(row.linkedInExtractedJson);
  const individual = parseIndividualProfile(row.individualProfileJson);
  return {
    contactId: row.contact.id,
    firstName: row.contact.firstName,
    lastName: row.contact.lastName,
    title: row.contact.title,
    email: row.contact.email,
    linkedinUrl: row.contact.linkedinUrl,
    personaId: row.chosenPersonaId,
    personaName: row.chosenPersona?.name ?? null,
    roleConfirmed: row.roleConfirmed,
    linkedInProfileText: row.linkedInProfileText,
    extractedTitle: extracted?.currentTitle?.text ?? null,
    individualStatus: row.individualProfileStatus,
    individualError: row.individualProfileError,
    commonGround: individual?.commonGround ?? [],
    caresAbout: individual?.caresAbout ?? [],
  };
}

function hiringTeamStatusChip(building: boolean): {
  kind: "none" | "building";
  text?: string;
} {
  if (building) {
    return { kind: "building", text: hiringTeamConfig.status.building };
  }
  return { kind: "none" };
}

function roleResponsibilityText(
  responsibilities: string | null,
  overview: string | null,
  definition: string | null,
): string {
  const text = (responsibilities ?? overview ?? definition ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text || hiringTeamConfig.noResponsibilities;
}

function KindMark({ kind }: { kind: string }) {
  return (
    <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
      {kind === "FACT" ? "Fact" : "Inference"}
    </span>
  );
}

async function HiringTeamSection({
  campaignId,
  organizationId,
  canEdit,
  jobs = [],
  asPage = false,
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
  jobs?: import("@/lib/application-jobs/workspace-status").WorkspaceJobStatusView[];
  asPage?: boolean;
}) {
  const [roles, templates, people] = await Promise.all([
    prisma.persona.findMany({
      where: { organizationId, campaignId, archivedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.personaTemplate.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listApplicationContacts({ organizationId, campaignId }),
  ]);
  const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
  const organizedRoles = roles.map((role) => ({
    role,
    narrative: readNarrative(role.profileJson),
  }));
  const directRoles = organizedRoles.filter(
    ({ narrative }) => narrative?.involvement !== "INDIRECT",
  );
  const indirectRoles = organizedRoles.filter(
    ({ narrative }) => narrative?.involvement === "INDIRECT",
  );
  const roleCard = ({
    role,
    narrative,
  }: (typeof organizedRoles)[number]) => {
    const building =
      role.setupStatus === "SYNTHESIZING" ||
      jobs.some(
        (job) =>
          job.type === "HIRING_TEAM_BUILD" &&
          job.targetId === role.id &&
          (job.status === "PENDING" || job.status === "IN_PROGRESS"),
      );
    const chip = hiringTeamStatusChip(building);
    const roleBuilt = isHiringTeamPersonaBuilt(role);
    const mappedPeople = people.filter((person) => person.chosenPersonaId === role.id);
    return (
    <div
      key={role.id}
      className="rounded-md border border-edge p-4"
      data-testid="hiring-team-role"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-ink">{role.name}</h4>
            {narrative?.involvement !== "INDIRECT" ? (
              <HiringTeamRecommendedMark personaId={role.id} />
            ) : null}
            {chip.kind === "building" ? (
              <span data-testid={`hiring-team-status-${role.id}`}>
                <AppPendingIndicator label={chip.text ?? hiringTeamConfig.status.building} />
              </span>
            ) : (
              <span
                className="text-xs text-subtle"
                data-testid={`hiring-team-researched-${role.id}`}
              >
                {roleBuilt
                  ? hiringTeamConfig.status.researched
                  : hiringTeamConfig.status.notResearched}
              </span>
            )}
          </div>
          {canEdit ? (
            <HiringTeamRoleActions
              personaId={role.id}
              addPersonForm={
                <HiringTeamPersonPicker
                  campaignId={campaignId}
                  personaId={role.id}
                  people={people.map((person) => ({
                    contactId: person.contactId,
                    name:
                      [person.contact.firstName, person.contact.lastName]
                        .filter(Boolean)
                        .join(" ")
                        .trim() ||
                      person.contact.title ||
                      person.contactId,
                    title: person.contact.title,
                  }))}
                />
              }
              editForm={
            <ApplicationActionForm
              action={updateApplicationRoleAction}
              submitLabel="Save edits"
              testId={`save-role-${role.id}`}
            >
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="personaId" value={role.id} />
              <label className="block text-sm">
                <span className="font-medium text-ink">Name</span>
                <input name="name" required defaultValue={role.name} className={fieldClass} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">Likely titles</span>
                <textarea
                  name="likelyTitles"
                  rows={2}
                  defaultValue={textList(role.targetTitles).join("\n")}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">Department</span>
                <input name="department" defaultValue={role.department ?? ""} className={fieldClass} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">Why this role matters</span>
                <textarea
                  name="whyThisRoleMatters"
                  rows={2}
                  defaultValue={role.whyThisPersonaMatters ?? ""}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">Notes</span>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={role.additionalContext ?? ""}
                  className={fieldClass}
                />
              </label>
            </ApplicationActionForm>
            }
            />
          ) : null}
        </div>
        <p className="text-sm text-ink">
          {textList(role.targetTitles).join(", ") || "No likely titles."}
        </p>
        <div data-testid={`hiring-team-responsibilities-${role.id}`}>
          <h5 className="text-sm font-medium text-ink">
            {hiringTeamConfig.responsibilitiesLabel}
          </h5>
          <p className="line-clamp-3 text-sm text-ink">
            {roleResponsibilityText(
              role.responsibilities,
              narrative?.overview ?? null,
              role.definition,
            )}
          </p>
        </div>
        <div data-testid={`hiring-team-people-${role.id}`}>
          <h5 className="text-sm font-medium text-ink">
            {hiringTeamConfig.mappedPeopleLabel}
          </h5>
          {mappedPeople.length === 0 ? (
            <p className="text-sm text-muted">{hiringTeamConfig.noMappedPeople}</p>
          ) : (
            mappedPeople.map((person) => (
            <div
              key={person.contactId}
              className="flex flex-wrap items-center justify-between gap-2"
              data-testid={`hiring-team-person-${person.contactId}`}
            >
              <p className="text-sm text-ink">
                {contactDisplayName(person.contact.firstName, person.contact.lastName)}
                {person.contact.title ? ` · ${person.contact.title}` : ""}
              </p>
              {canEdit ? (
                <AppActionLink
                  href={workspaceContactEditHref(person.contactId, campaignId)}
                  variant="chip"
                  data-testid={`edit-contact-${person.contactId}`}
                >
                  {outreachConfig.labels.editContact}
                </AppActionLink>
              ) : null}
            </div>
            ))
          )}
        </div>
        {role.whyThisPersonaMatters ? (
          <p className="text-sm text-ink">{role.whyThisPersonaMatters}</p>
        ) : null}
        {canEdit ? (
          <HiringTeamCheatSheetToggle
            campaignId={campaignId}
            personaId={role.id}
            added={role.cheatSheetActivatedAt != null}
          />
        ) : null}
        {canEdit ? (
          <ApplicationActionForm
            action={moveApplicationRoleInvolvementAction}
            submitLabel={
              narrative?.involvement === "INDIRECT"
                ? hiringTeamConfig.actions.moveToDirect
                : hiringTeamConfig.actions.moveToIndirect
            }
            variant="secondary"
            testId={`move-role-involvement-${role.id}`}
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="personaId" value={role.id} />
            <input
              type="hidden"
              name="involvement"
              value={narrative?.involvement === "INDIRECT" ? "DIRECT" : "INDIRECT"}
            />
          </ApplicationActionForm>
        ) : null}
      </div>
      <details
        className="mt-4 space-y-0 rounded-md border border-edge p-3"
        data-testid={`hiring-team-details-${role.id}`}
      >
      <summary className="cursor-pointer text-sm font-medium text-ink">
        {hiringTeamDetailsTitle(role.name)}
      </summary>
      <div className="mt-4 space-y-3">
        {role.department ? (
          <p className="text-sm text-ink">{role.department}</p>
        ) : null}
        {narrative?.overview ? (
          <p className="text-sm text-ink">{narrative.overview}</p>
        ) : role.definition ? (
          <p className="text-sm text-ink">{role.definition}</p>
        ) : null}
        {narrative?.impact ? (
          <p className="text-sm text-ink">
            {narrative.impact.text}
            <KindMark kind={narrative.impact.kind} />
          </p>
        ) : null}
        {narrative ? (
          <>
            <AnnotatedBlock title="Pressures" items={narrative.pressures} />
            <AnnotatedBlock title="What they need" items={narrative.needs} />
            <AnnotatedBlock title="Concerns" items={narrative.concerns} />
            {narrative.interviewStage ? (
              <p className="text-sm text-ink">
                Interview stage: {narrative.interviewStage.text}
                <KindMark kind={narrative.interviewStage.kind} />
              </p>
            ) : null}
            <AnnotatedBlock title="What they evaluate" items={narrative.evaluates} />
            <AnnotatedBlock title="Talking points" items={narrative.talkingPoints} />
            <AnnotatedBlock title="How to communicate" items={narrative.communication} />
            <AnnotatedBlock
              title="Why they were identified"
              items={narrative.identificationEvidence}
            />
          </>
        ) : null}
        {role.additionalContext ? (
          <p className="text-sm text-ink">{role.additionalContext}</p>
        ) : null}
        {canEdit ? (
          <div className="space-y-3 print:hidden">
            <div className="flex flex-wrap gap-3">
              <ApplicationActionForm
                action={removeApplicationRoleAction}
                submitLabel="Remove role"
                variant="danger"
                testId={`remove-role-${role.id}`}
              >
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="personaId" value={role.id} />
              </ApplicationActionForm>
              {roleBuilt ? (
              <ApplicationActionForm
                action={saveRoleAsTemplateAction}
                submitLabel="Save as template"
                testId={`save-role-template-${role.id}`}
                variant="secondary"
              >
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="personaId" value={role.id} />
              </ApplicationActionForm>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      </details>
    </div>
  );
  };
  return (
    <>
    {asPage ? <HiringTeamAssumptionNotice /> : null}
    <details id="hiring-team" className="space-y-4 rounded-lg border border-edge bg-surface p-5" data-testid="hiring-team">
      {asPage ? <OpenDetailsOnMount /> : null}
      <summary className="cursor-pointer text-base font-semibold text-ink">
        {hiringTeamConfig.workspaceTitle}
      </summary>
      <div className="mt-4 space-y-4">
      {asPage ? null : <HiringTeamAssumptionNotice />}
      <WorkspaceProgress jobs={jobs} type="HIRING_TEAM_IDENTIFY" />
      <WorkspaceProgress jobs={jobs} type="HIRING_TEAM_BUILD" />
      <WorkspaceProgress jobs={jobs} type="CONTACT_PROFILE" />
      {canEdit ? <AddPersonaSection campaignId={campaignId} /> : null}
      {roles.length === 0 ? (
        <p className="text-sm text-muted">No {vocab.persona.plural} yet.</p>
      ) : (
        <div className="space-y-5">
          {directRoles.length > 0 ? (
            <>
              <HiringTeamRecommendedLine />
              <HiringTeamDisclosureGroup
                groupKey="direct"
                title={hiringTeamConfig.sections.direct}
              >
                {directRoles.map(roleCard)}
              </HiringTeamDisclosureGroup>
            </>
          ) : null}
          <HiringTeamDisclosureGroup
            groupKey="indirect"
            title={hiringTeamConfig.sections.indirect}
          >
            {indirectRoles.length > 0 ? (
              indirectRoles.map(roleCard)
            ) : (
              <p className="text-sm text-subtle">
                No indirect {vocab.persona.plural.toLowerCase()}.
              </p>
            )}
          </HiringTeamDisclosureGroup>
        </div>
      )}
      {canEdit && templates.length > 0 ? (
        <ApplicationActionForm action={addTemplateRoleAction} submitLabel="Add saved template" testId="add-template-role">
          <input type="hidden" name="campaignId" value={campaignId} />
          <label className="block text-sm">
            <span className="font-medium text-ink">Saved template</span>
            <select name="templateId" required className={fieldClass} defaultValue="">
              <option value="" disabled>
                Choose a template
              </option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        </ApplicationActionForm>
      ) : null}
      </div>
    </details>
    </>
  );
}

function AnnotatedBlock({
  title,
  items,
}: {
  title: string;
  items: Array<{ text: string; kind: string }>;
}) {
  const visible = items.filter((item) => item.text.replace(/\s+/g, " ").trim());
  if (visible.length === 0) return null;
  return (
    <div>
      <h4 className="text-sm font-medium text-ink">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
        {visible.map((item) => (
          <li key={item.text}>
            {item.text}
            <KindMark kind={item.kind} />
          </li>
        ))}
      </ul>
    </div>
  );
}
