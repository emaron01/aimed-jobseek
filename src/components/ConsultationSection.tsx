import {
  resumeConsultationAction,
  retryConsultationAction,
  skipConsultationAction,
  startConsultationAction,
} from "@/app/actions/consultation";
import { AppPendingIndicator } from "@/components/AppButton";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import {
  WorkspaceProgress,
} from "@/components/ApplicationWorkspaceLive";
import {
  buildConsultationQaView,
  consultationHasUnansweredQuestions,
  latestClosingNote,
} from "@/lib/consultation/qa-view";
import {
  buildHarperQaLayout,
  collectRenderedHarperQuestionTurnIds,
  harperContentRenderCoverage,
  partitionGeneralQuestionsForStanding,
  type HarperInterviewerOrderItem,
} from "@/lib/consultation/harper-layout";
import {
  additionalInterviewPrepQaForProfile,
  orderedAnsweredHarperQuestions,
  profilePrimaryQuestionTurnIdsFromInterviewerSection,
} from "@/lib/consultation/additional-prep-qa";
import {
  buildStandingGaps,
  qaItemForTargetKey,
  standingGapStatus,
  standingWorkIsComplete,
} from "@/lib/consultation/standing";
import { buildStandingListEntries } from "@/lib/consultation/standing-entries";
import { listPersonPreps } from "@/lib/interview/person-prep";
import { getApplicationSummaryView } from "@/lib/application-summary/service";
import { ConsultationKnowAboutMe } from "@/components/ConsultationKnowAboutMe";
import { ConsultationStanding } from "@/components/ConsultationStanding";
import { HarperDraftProvider } from "@/components/HarperDraftStore";
import {
  HarperFilterProvider,
  HarperPeopleFilter,
  HarperPersonViewShell,
  HarperSelectPersonLink,
  HarperStandingView,
} from "@/components/HarperPeopleFilter";
import {
  HarperAddInterviewContactForm,
  HarperPersonInlineProfile,
} from "@/components/HarperPersonView";
import { OpenWorkspaceHashSection } from "@/components/OpenWorkspaceHashSection";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";
import {
  WORKSPACE_CARD_WRAP_CLASS,
  WORKSPACE_MESSAGE_WRAP_CLASS,
} from "@/lib/application/workspace-links";
import {
  consultationBriefingSchema,
} from "@/lib/consultation/contract";
import {
  isStandingRequirement,
  profileEvidenceItems,
} from "@/lib/consultation/assess";
import {
  resolveEvidenceLabels,
  stripInternalIdsFromDisplayText,
} from "@/lib/consultation/evidence-display";
import { formatExperienceLine } from "@/lib/consultation/experience-display";
import { prisma } from "@/lib/prisma";
import {
  consultationConfig,
  consultationConversationCopy,
  interviewConfig,
  isObsoleteWorkspaceFailure,
  vocab,
  workspaceJobCopy,
  workspaceSectionId,
} from "@/lib/product-config";
import {
  emptyCandidateProfile,
  parseCandidateProfileSafe,
} from "@/lib/product-research/candidate-profile";
import { seekerBackgroundText } from "@/lib/product-research/seeker-background";
import { parseStringArray } from "@/lib/research";

function experienceCalculation(value: unknown): {
  requiredYears: number;
  totalMonths: number;
  totalYears: number;
  maximumMonths: number;
  maximumYears: number;
  missingDateRoleIds: string[];
  periods: Array<{ roleId: string; startDate: string; endDate: string }>;
} | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.requiredYears !== "number" ||
    typeof row.totalMonths !== "number" ||
    typeof row.totalYears !== "number"
  ) {
    return null;
  }
  const periods = Array.isArray(row.periods)
    ? row.periods.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const period = entry as Record<string, unknown>;
        if (
          typeof period.roleId !== "string" ||
          typeof period.startDate !== "string" ||
          typeof period.endDate !== "string"
        ) {
          return [];
        }
        return [{
          roleId: period.roleId,
          startDate: period.startDate,
          endDate: period.endDate,
        }];
      })
    : [];
  return {
    requiredYears: row.requiredYears,
    totalMonths: row.totalMonths,
    totalYears: row.totalYears,
    maximumMonths:
      typeof row.maximumMonths === "number" ? row.maximumMonths : row.totalMonths,
    maximumYears:
      typeof row.maximumYears === "number" ? row.maximumYears : row.totalYears,
    missingDateRoleIds: parseStringArray(row.missingDateRoleIds),
    periods,
  };
}

export async function ConsultationSection({
  campaignId,
  organizationId,
  canEdit,
  jobs = [],
  initialPersonKey = null,
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
  jobs?: WorkspaceJobStatusView[];
  /** From summary Edit/Answer links: `?person=contact:{id}`. */
  initialPersonKey?: string | null;
}) {
  const [session, campaign, stages, summaryView] = await Promise.all([
    prisma.consultationSession.findFirst({
      where: { campaignId, organizationId },
      include: {
        assessments: { orderBy: { targetKey: "asc" } },
        turns: { orderBy: { sequence: "asc" } },
        statements: { orderBy: [{ turnId: "asc" }, { kind: "asc" }] },
      },
    }),
    prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      select: {
        product: { select: { profileJson: true } },
        jobRequirement: { select: { title: true } },
      },
    }),
    prisma.interviewStage.findMany({
      where: { campaignId, organizationId },
      orderBy: [{ scheduledAt: "asc" }, { sortOrder: "asc" }],
      select: {
        scheduledAt: true,
        interviewers: {
          select: {
            contact: {
              select: { id: true, firstName: true, lastName: true, title: true },
            },
          },
        },
      },
    }),
    getApplicationSummaryView({ organizationId, campaignId }),
  ]);
  const hiringRoles = summaryView.roles.map((role) => ({
    id: role.id,
    name: role.name,
  }));
  const parsed = campaign?.product.profileJson
    ? parseCandidateProfileSafe(campaign.product.profileJson)
    : { ok: true as const, profile: emptyCandidateProfile() };
  const profileItems = parsed.ok ? profileEvidenceItems(parsed.profile) : [];
  const personPreps = await listPersonPreps({ organizationId, campaignId });
  const interviewerOrder = new Map<string, HarperInterviewerOrderItem>();
  for (const stage of stages) {
    const sortAt = stage.scheduledAt.getTime();
    for (const row of stage.interviewers) {
      const contactId = row.contact.id;
      const heading =
        [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ").trim() ||
        row.contact.title?.trim() ||
        interviewConfig.labels.interviewer;
      const existing = interviewerOrder.get(contactId);
      if (!existing || existing.sortAt == null || sortAt < existing.sortAt) {
        interviewerOrder.set(contactId, { contactId, heading, sortAt });
      }
    }
  }
  const briefing = session
    ? consultationBriefingSchema.safeParse(session.briefingJson)
    : null;
  const failed =
    session?.generationStatus === "FAILED" &&
    !isObsoleteWorkspaceFailure(session.generationError);
  const qualityNote =
    session?.generationStatus === "GENERATING"
      ? null
      : (session?.generationError?.trim() &&
          !isObsoleteWorkspaceFailure(session.generationError)
          ? session.generationError.trim()
          : null) ||
        (failed ? consultationConversationCopy.generationFailed : null);
  const statements = session?.statements ?? [];
  const consultationBusy = jobs.some(
    (job) =>
      job.type === "CONSULTATION" &&
      (job.status === "PENDING" || job.status === "IN_PROGRESS"),
  );
  const threadTurns =
    session?.turns.map((turn) => ({
      id: turn.id,
      speaker: turn.speaker,
      body: turn.body,
      targetKey: turn.targetKey,
      followUp: turn.followUp,
      sequence: turn.sequence,
      analysisJson: turn.analysisJson,
      intent: turn.intent,
    })) ?? [];
  const threadStatements = statements.map((statement) => ({
    id: statement.id,
    turnId: statement.turnId,
    kind: statement.kind,
    status: statement.status,
    content: statement.content,
    strengtheningNote: statement.strengtheningNote,
    createdAt: statement.createdAt,
  }));
  const qaView = buildConsultationQaView({
    turns: threadTurns,
    statements: threadStatements,
  });
  const standingRequirements =
    session?.assessments
      .filter((item) =>
        isStandingRequirement({
          key: item.targetKey,
          kind: item.kind as
            | "REQUIRED"
            | "OUTCOME"
            | "COMPETENCY"
            | "MISSION"
            | "PREFERRED",
          text: item.text,
        }),
      )
      .map((item) => {
      const facts = resolveEvidenceLabels(
        parseStringArray(item.supportingFactIds),
        profileItems,
      );
      const calculation = experienceCalculation(item.experienceCalculationJson);
      const roleIds = calculation
        ? [
            ...calculation.periods.map((period) => period.roleId),
            ...calculation.missingDateRoleIds,
          ]
        : [];
      const roles = roleIds.flatMap((id) => {
        const profileItem = profileItems.find((entry) => entry.id === id);
        if (!profileItem) return [];
        return [
          {
            id: profileItem.id,
            employer: profileItem.employer ?? null,
            title: profileItem.title ?? null,
            label:
              profileItem.title?.trim() ||
              profileItem.employer?.trim() ||
              profileItem.text.trim(),
          },
        ];
      });
      const qaItem = qaItemForTargetKey(qaView.questions, item.targetKey);
      const worked = Boolean(
        qaItem &&
          (qaItem.seekerAnswers.length > 0 ||
            qaItem.talkingPoint ||
            qaItem.resumeBullet),
      );
      return {
        id: item.id,
        targetKey: item.targetKey,
        text: item.text,
        kind: item.kind as
          | "REQUIRED"
          | "OUTCOME"
          | "COMPETENCY"
          | "MISSION"
          | "PREFERRED",
        strength: item.strength as "STRONG" | "PARTIAL" | "NONE",
        explanation: item.explanation
          ? stripInternalIdsFromDisplayText(item.explanation)
          : item.explanation,
        gapStatus: worked ? standingGapStatus(qaItem).status : null,
        facts: facts.map((fact) => ({
          id: fact.id,
          label: fact.label,
          detail: fact.detail,
        })),
        experience: calculation
          ? formatExperienceLine({
              totalYears: calculation.totalYears,
              periods: calculation.periods,
              missingDateRoleIds: calculation.missingDateRoleIds,
              roles,
            })
          : null,
      };
    }) ?? [];
  const unanswered = consultationHasUnansweredQuestions(qaView);
  const standingGaps = session
    ? buildStandingGaps({
        assessments: session.assessments
          .filter((item) =>
            isStandingRequirement({
              key: item.targetKey,
              kind: item.kind as
                | "REQUIRED"
                | "OUTCOME"
                | "COMPETENCY"
                | "MISSION"
                | "PREFERRED",
              text: item.text,
            }),
          )
          .map((item) => ({
            key: item.targetKey,
            kind: item.kind as
              | "REQUIRED"
              | "OUTCOME"
              | "COMPETENCY"
              | "MISSION"
              | "PREFERRED",
            text: item.text,
            strength: item.strength,
          })),
        questions: qaView.questions,
      })
    : [];
  const qaLayout = buildHarperQaLayout({
    questions: qaView.questions,
    interviewers: [...interviewerOrder.values()],
  });
  const requirementLabels = new Map(
    (session?.assessments ?? []).map((item) => [item.targetKey, item.text]),
  );
  const standingInline = partitionGeneralQuestionsForStanding({
    general: qaLayout.general,
    requirementTargetKeys: standingRequirements.map((item) => item.targetKey),
    requirementLabels,
  });
  const orphanedStandingRequirements = standingInline.orphanedRequirementTopics.map(
    (topic) => ({
      id: `orphaned:${topic.targetKey}`,
      targetKey: topic.targetKey,
      text: topic.label,
      kind: null as
        | "REQUIRED"
        | "OUTCOME"
        | "COMPETENCY"
        | "MISSION"
        | "PREFERRED"
        | null,
      strength: null as "STRONG" | "PARTIAL" | "NONE" | null,
      explanation: null,
      gapStatus: null,
      facts: [] as Array<{ id: string; label: string; detail: string | null }>,
      experience: null,
    }),
  );
  const standingRequirementsForUi = [
    ...standingRequirements,
    ...orphanedStandingRequirements,
  ];
  const requirementQuestionsForUi = [
    ...standingInline.byRequirementKey.entries(),
    ...standingInline.orphanedRequirementTopics.map(
      (topic) => [topic.targetKey, topic.questions] as const,
    ),
  ].map(([targetKey, questions]) => ({
    targetKey,
    questions,
  }));
  const questionsByStandingTarget = new Map(
    requirementQuestionsForUi.map((row) => [row.targetKey, row.questions]),
  );
  const standingEntries = buildStandingListEntries({
    requirements: standingRequirementsForUi.map((row) => ({
      id: row.id,
      targetKey: row.targetKey,
      text: row.text,
      strength: row.strength,
      kind: row.kind,
      explanation: row.explanation,
      experience: row.experience,
      facts: row.facts,
    })),
    dedicatedTopics: standingInline.dedicatedTopics,
    questionsByTargetKey: questionsByStandingTarget,
  });
  const answeredInHarperOrder = orderedAnsweredHarperQuestions({
    dedicatedTopics: standingInline.dedicatedTopics,
    standingRequirementRows: standingRequirementsForUi.map((row) => ({
      targetKey: row.targetKey,
      questions: questionsByStandingTarget.get(row.targetKey) ?? [],
    })),
    interviewers: qaLayout.interviewers,
  });
  // Render-time invariant (tested): every contentful Harper item is placed.
  // STOP leftovers stay in standingInline.unmapped for the report — never "Other".
  void harperContentRenderCoverage({
    questions: qaView.questions,
    renderedQuestionTurnIds: collectRenderedHarperQuestionTurnIds({
      interviewers: qaLayout.interviewers,
      dedicatedTopics: standingInline.dedicatedTopics,
      byRequirementKey: standingInline.byRequirementKey,
      orphanedRequirementTopics: standingInline.orphanedRequirementTopics,
    }),
  });
  const prepStartedByContact = new Set(personPreps.map((prep) => prep.contactId));
  const interviewerByContact = new Map(
    qaLayout.interviewers.map((section) => [section.contactId, section]),
  );
  const filterOptionsByKey = new Map(
    summaryView.people.map((person) => [
      person.sectionKey,
      {
        sectionKey: person.sectionKey,
        heading: person.heading,
        personName: person.contactId ? person.heading : null,
        personaName: person.roleName,
        titles: person.titles,
      },
    ]),
  );
  for (const section of qaLayout.interviewers) {
    const sectionKey = `contact:${section.contactId}`;
    if (!filterOptionsByKey.has(sectionKey)) {
      filterOptionsByKey.set(sectionKey, {
        sectionKey,
        heading: section.heading,
        personName: section.heading,
        personaName: "",
        titles: [],
      });
    }
  }
  for (const prep of personPreps) {
    const sectionKey = `contact:${prep.contactId}`;
    if (!filterOptionsByKey.has(sectionKey)) {
      filterOptionsByKey.set(sectionKey, {
        sectionKey,
        heading: prep.name || prep.roleName || interviewConfig.labels.interviewer,
        personName: prep.name || null,
        personaName: prep.roleName ?? "",
        titles: prep.title ? [prep.title] : [],
      });
    }
  }
  const filterOptions = [...filterOptionsByKey.values()];
  const guidancePeople = summaryView.guidance?.people ?? [];
  const harperPeople: Array<{
    contactId: string;
    sectionKey: string;
    heading: string;
    personaId: string;
    personaBuilt: boolean;
    involvement: "DIRECT" | "INDIRECT" | null;
    section: (NonNullable<typeof summaryView.guidance>["people"])[number] | null;
    notes: NonNullable<ReturnType<typeof summaryView.notesByContactId.get>>;
  }> = [];
  const seenPeople = new Set<string>();
  for (const person of summaryView.people) {
    if (!person.contactId || seenPeople.has(person.contactId)) continue;
    seenPeople.add(person.contactId);
    harperPeople.push({
      contactId: person.contactId,
      sectionKey: person.sectionKey,
      heading: person.heading,
      personaId: person.roleId,
      personaBuilt: person.personaBuilt,
      involvement: person.involvement,
      section:
        guidancePeople.find((item) => item.sectionKey === person.sectionKey) ?? null,
      notes: summaryView.notesByContactId.get(person.contactId) ?? [],
    });
  }
  for (const section of qaLayout.interviewers) {
    if (seenPeople.has(section.contactId)) continue;
    seenPeople.add(section.contactId);
    const sectionKey = `contact:${section.contactId}`;
    harperPeople.push({
      contactId: section.contactId,
      sectionKey,
      heading: section.heading,
      personaId: "",
      personaBuilt: false,
      involvement: null,
      section: guidancePeople.find((item) => item.sectionKey === sectionKey) ?? null,
      notes: summaryView.notesByContactId.get(section.contactId) ?? [],
    });
  }
  for (const prep of personPreps) {
    if (seenPeople.has(prep.contactId)) continue;
    seenPeople.add(prep.contactId);
    const sectionKey = `contact:${prep.contactId}`;
    const role = summaryView.roles.find((item) => item.id === prep.personaId);
    harperPeople.push({
      contactId: prep.contactId,
      sectionKey,
      heading: prep.name || prep.roleName || interviewConfig.labels.interviewer,
      personaId: prep.personaId ?? "",
      personaBuilt: Boolean(prep.personaId),
      involvement: role?.involvement ?? null,
      section: guidancePeople.find((item) => item.sectionKey === sectionKey) ?? null,
      notes: summaryView.notesByContactId.get(prep.contactId) ?? [],
    });
  }
  const hasStanding =
    briefing?.success ||
    standingRequirementsForUi.length > 0 ||
    standingInline.dedicatedTopics.length > 0;
  const standingComplete = standingWorkIsComplete({
    gaps: standingGaps,
    unansweredQuestions: unanswered,
  });
  const threadStatus =
    session &&
    (session.status === "DONE" || session.status === "SKIPPED") &&
    !standingComplete
      ? "IN_PROGRESS"
      : session?.status ?? "";
  const closingNote = standingComplete
    ? latestClosingNote(threadTurns)
    : null;

  return (
    <>
      <OpenWorkspaceHashSection sectionId={workspaceSectionId("CONSULTATION")} />
      <section
        id={workspaceSectionId("CONSULTATION")}
        className={`space-y-4 rounded-lg border border-edge bg-surface p-5 ${WORKSPACE_CARD_WRAP_CLASS}`}
        data-testid="consultation"
      >
        <h2 className="text-base font-semibold text-ink">
          {consultationConfig.displayName}
        </h2>
        <p
          className={`text-sm text-muted ${WORKSPACE_MESSAGE_WRAP_CLASS}`}
          data-testid="harper-coaching-disclaimer"
        >
          {consultationConversationCopy.coachingDisclaimer}
        </p>
        <p className={`text-sm text-muted ${WORKSPACE_MESSAGE_WRAP_CLASS}`}>
          {consultationConfig.displayName} compares this job with the{" "}
          {vocab.product.singular} and draws out the stories behind the gaps.
          Nothing is added to the {vocab.product.singular} until you confirm it.
        </p>
        {canEdit ? (
          <ConsultationKnowAboutMe
            campaignId={campaignId}
            initialText={parsed.ok ? seekerBackgroundText(parsed.profile) : ""}
          />
        ) : null}
        <WorkspaceProgress jobs={jobs} type="CONSULTATION" stayAndWatch />
        {consultationBusy ? (
          <div className="space-y-1 text-sm text-muted" data-testid="harper-typing">
            <p>
              <AppPendingIndicator label={workspaceJobCopy.typing} />
            </p>
            <p data-testid="harper-processing-minutes">
              {consultationConversationCopy.processingCanTakeMinutes}
            </p>
          </div>
        ) : null}
        <HarperDraftProvider>
        <HarperFilterProvider
          options={filterOptions}
          initialPersonKey={initialPersonKey}
        >
          <HarperPeopleFilter />
          {canEdit ? (
            <div className="mt-3">
              <HarperAddInterviewContactForm
                campaignId={campaignId}
                roles={hiringRoles}
              />
            </div>
          ) : null}
          <HarperStandingView>
        {personPreps.length > 0 ? (
          <div className="mt-3 space-y-3" data-testid="person-prep-offers">
            {personPreps.map((prep) => (
              <article
                key={prep.contactId}
                className="rounded-md border border-edge bg-canvas p-4"
              >
                <h4 className="text-sm font-semibold text-ink">
                  <HarperSelectPersonLink
                    sectionKey={`contact:${prep.contactId}`}
                    className="text-left text-sm font-semibold text-ink underline decoration-ink underline-offset-2"
                    testId={`harper-prep-card-${prep.contactId}`}
                  >
                    {interviewConfig.labels.personPrepOffer}:{" "}
                    {prep.name || prep.roleName}
                  </HarperSelectPersonLink>
                </h4>
                {prep.openingText ? (
                  <p className="mt-2 text-sm text-ink">{prep.openingText}</p>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    <AppPendingIndicator label={workspaceJobCopy.typing} />
                  </p>
                )}
                {prep.confirmedAnswers.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                    {prep.confirmedAnswers.map((answer) => (
                      <li key={answer.turnId}>{answer.text}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
        {qualityNote ? (
          <div
            className={`mt-3 space-y-2 rounded-md border border-warning bg-warning-tint p-3 ${WORKSPACE_CARD_WRAP_CLASS}`}
            data-testid="consultation-failed"
          >
            <p className={`text-sm text-warning ${WORKSPACE_MESSAGE_WRAP_CLASS}`}>
              {qualityNote}
            </p>
            {canEdit ? (
              <ApplicationActionForm
                action={retryConsultationAction}
                submitLabel={consultationConversationCopy.retry}
                testId="retry-consultation"
              >
                <input type="hidden" name="campaignId" value={campaignId} />
              </ApplicationActionForm>
            ) : null}
          </div>
        ) : null}
        {threadStatus === "SKIPPED" ? (
          <p className="mt-3 text-sm text-ink">
            Consultation is skipped. Materials can still be generated from the{" "}
            {vocab.product.singular} alone.
          </p>
        ) : null}
        {threadStatus === "PAUSED" ? (
          <p className="mt-3 text-sm text-ink">Paused. Resume when you want to continue.</p>
        ) : null}
        {standingComplete && closingNote ? (
          <p className="mt-3 text-sm text-ink" data-testid="consultation-complete">
            {stripInternalIdsFromDisplayText(closingNote)}
          </p>
        ) : null}
        {canEdit && !session && !consultationBusy ? (
          <div className="mt-3 flex flex-wrap gap-3">
            <ApplicationActionForm
              action={startConsultationAction}
              submitLabel={consultationConversationCopy.start}
              testId="start-consultation"
            >
              <input type="hidden" name="campaignId" value={campaignId} />
            </ApplicationActionForm>
            <ApplicationActionForm
              action={skipConsultationAction}
              submitLabel="Skip consultation"
              testId="skip-consultation"
            >
              <input type="hidden" name="campaignId" value={campaignId} />
            </ApplicationActionForm>
          </div>
        ) : null}
        {hasStanding ? (
          <section
            className="mt-3 space-y-4"
            data-testid="consultation-standing-panel"
          >
            <p
              className={`text-sm text-ink ${WORKSPACE_MESSAGE_WRAP_CLASS}`}
              data-testid="harper-page-intro"
            >
              {consultationConversationCopy.pageIntro}
            </p>
            <div className="space-y-4">
              {briefing?.success ? (
                <div className="space-y-2" data-testid="consultation-briefing">
                  <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                    {briefing.data.strongestAngles.map((item) => (
                      <li key={item}>
                        {stripInternalIdsFromDisplayText(item)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {session &&
              (standingEntries.length > 0 ||
                standingInline.dedicatedTopics.length > 0 ||
                standingRequirementsForUi.length > 0) ? (
                <ConsultationStanding
                  campaignId={campaignId}
                  canEdit={canEdit}
                  acceptingReplies={threadStatus !== "SKIPPED"}
                  sessionStatus={threadStatus}
                  jobsActive={consultationBusy}
                  jobTitle={campaign?.jobRequirement?.title ?? null}
                  overall={
                    briefing?.success
                      ? stripInternalIdsFromDisplayText(briefing.data.overall)
                      : null
                  }
                  entries={standingEntries}
                  careerRecap={null}
                />
              ) : (
                <p className="text-sm text-muted">
                  Evidence has not been assessed yet.
                </p>
              )}
            </div>
          </section>
        ) : null}
          </HarperStandingView>
          {harperPeople.map((person) => {
            const interviewerSection =
              interviewerByContact.get(person.contactId) ?? null;
            const additionalPrepEntries = additionalInterviewPrepQaForProfile({
              involvement: person.involvement,
              profilePrimaryQuestionTurnIds:
                profilePrimaryQuestionTurnIdsFromInterviewerSection(
                  interviewerSection,
                ),
              answeredInHarperOrder,
            });
            return (
            <HarperPersonViewShell
              key={person.sectionKey}
              sectionKey={person.sectionKey}
            >
              <div className="mt-3">
                <HarperPersonInlineProfile
                  campaignId={campaignId}
                  canEdit={canEdit}
                  contactId={person.contactId}
                  heading={person.heading}
                  sectionKey={person.sectionKey}
                  section={person.section}
                  notes={person.notes}
                  personaBuilt={person.personaBuilt}
                  personaId={person.personaId}
                  prepStarted={prepStartedByContact.has(person.contactId)}
                  interviewerSection={interviewerSection}
                  sessionStatus={threadStatus}
                  jobsActive={consultationBusy}
                  additionalPrepEntries={additionalPrepEntries}
                />
              </div>
            </HarperPersonViewShell>
            );
          })}
        </HarperFilterProvider>
        </HarperDraftProvider>
        {canEdit && (threadStatus === "PAUSED" || threadStatus === "SKIPPED") ? (
          <ApplicationActionForm
            action={resumeConsultationAction}
            submitLabel="Resume"
            testId="resume-consultation"
          >
            <input type="hidden" name="campaignId" value={campaignId} />
          </ApplicationActionForm>
        ) : null}
      </section>
    </>
  );
}
