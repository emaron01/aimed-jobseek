"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import {
  addApplicationContactAction,
  generateOutreachAssetAction,
  markApplicationAppliedAction,
  setApplicationProgressAction,
  markOutreachSentAction,
  saveOutreachMessageEditAction,
  updateApplicationContactRoleAction,
  type ApplicationOutreachActionResult,
} from "@/app/actions/application-outreach";
import { interviewConfig } from "@/lib/product-config";
import {
  applicationAssetContentSchema,
  composeOutreachText,
  type ApplicationAssetContent,
} from "@/lib/application-assets/contract";
import {
  formatOutreachGeneratorKindLabel,
  formatOutreachHistoryLine,
  formatOutreachTypeLabel,
  type OutreachGeneratorKind,
} from "@/lib/application-assets/display";
import { outreachEmailHandoff } from "@/lib/application-assets/handoff";
import { openEmailClientHref } from "@/lib/email-generation/email-body";
import {
  outreachConfig,
  polishCopy,
  vocab,
} from "@/lib/product-config";
import { SubmitButton, AppButton, AppActionLink, PageHeader } from "@/components/ui";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { InlineActionStatus } from "@/components/InlineActionStatus";
import {
  WORKSPACE_CARD_WRAP_CLASS,
  WORKSPACE_MESSAGE_WRAP_CLASS,
  workspaceAssetDocxHref,
  workspaceContactEditHref,
} from "@/lib/application/workspace-links";

const initial: ApplicationOutreachActionResult | null = null;

type RoleOption = {
  id: string;
  name: string;
  suggestionKey: string | null;
  personaBuilt: boolean;
};

type ContactRow = {
  contactId: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  personaId: string | null;
  personaName: string | null;
  roleConfirmed: boolean;
  linkedInProfileText: string | null;
  extractedTitle: string | null;
  individualStatus: string | null;
  individualError: string | null;
  commonGround: Array<{
    text: string;
    seekerSource: string;
    contactSource: string;
  }>;
  caresAbout: Array<{ text: string }>;
};

type OutreachRow = {
  id: string;
  type: "EMAIL" | "LINKEDIN_CONNECTION_NOTE" | "LINKEDIN_INMAIL";
  version: number;
  status: "DRAFT" | "APPROVED";
  personaId: string | null;
  contactId: string | null;
  purpose: "PROACTIVE" | "FOLLOW_UP" | "THANK_YOU" | "CHECK_IN" | null;
  sentAt: string | null;
  createdAt: string;
  emailLength: "SHORT" | "MEDIUM" | "LONG" | null;
  content: unknown;
};

type InterviewStageRow = {
  id: string;
  type: keyof typeof interviewConfig.types;
  format: keyof typeof interviewConfig.formats;
  scheduledAt: string;
  notesAfter?: string | null;
  thankYouClarifyJson?: unknown;
  interviewerContactId?: string | null;
  personaId?: string | null;
};

const GENERATOR_KINDS: OutreachGeneratorKind[] = [
  "EMAIL",
  "LINKEDIN_CONNECTION_NOTE",
  "LINKEDIN_INMAIL",
  "INTERVIEW_THANK_YOU",
];

function Status({
  result,
  suppressJobFailure = false,
}: {
  result: ApplicationOutreachActionResult | null;
  /** The section banner already shows a finished job error. */
  suppressJobFailure?: boolean;
}) {
  if (!result) return null;
  return (
    <InlineActionStatus result={result} suppressJobFailure={suppressJobFailure}>
      {result.violations?.length ? (
        <ul className="mt-1 list-disc pl-5">
          {result.violations.map((violation) => (
            <li key={violation}>{violation}</li>
          ))}
        </ul>
      ) : null}
    </InlineActionStatus>
  );
}

function todayInputValue(value?: string | null): string {
  if (value) return value.slice(0, 10);
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function contactName(contact: ContactRow): string {
  return (
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    vocab.contact.Singular
  );
}

function messagesForContact(
  assets: OutreachRow[],
  contactId: string,
): OutreachRow[] {
  return assets
    .filter((asset) => asset.contactId === contactId)
    .sort((left, right) => {
      const time = left.createdAt.localeCompare(right.createdAt);
      return time !== 0 ? time : left.version - right.version;
    });
}

export function sentMessagesForContact(
  assets: OutreachRow[],
  contactId: string,
): OutreachRow[] {
  return messagesForContact(assets, contactId).filter((asset) => asset.sentAt);
}

export function latestOutreachMessageId(
  assets: OutreachRow[],
  contactId: string,
): string {
  const messages = messagesForContact(assets, contactId);
  return messages[messages.length - 1]?.id ?? "";
}

function interviewStageLabel(stage: InterviewStageRow): string {
  const date = new Date(stage.scheduledAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Interview stage date is invalid.");
  }
  const stamped = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
  return `${interviewConfig.types[stage.type]} · ${stamped}`;
}

function stageThankYouClarify(stage: InterviewStageRow): {
  questions: Array<{ id: string; text: string }>;
  needsAnswers: boolean;
} {
  const thankYouClarify =
    stage.thankYouClarifyJson &&
    typeof stage.thankYouClarifyJson === "object"
      ? (stage.thankYouClarifyJson as {
          questions?: Array<{ id: string; text: string }>;
          answers?: Array<{ id: string; answer: string }>;
          skipped?: boolean;
        })
      : null;
  const questions =
    thankYouClarify?.questions?.filter((item) => item.id && item.text) ?? [];
  const needsAnswers =
    questions.length > 0 &&
    !thankYouClarify?.skipped &&
    !(thankYouClarify?.answers?.some((item) => item.answer?.trim()) ?? false);
  return { questions, needsAnswers };
}

export function contactOutreachReadyLabel(
  assets: OutreachRow[],
  contactId: string,
): string | null {
  const messages = messagesForContact(assets, contactId);
  const latestUnsent = [...messages].reverse().find((asset) => !asset.sentAt);
  if (!latestUnsent) return null;
  return `${formatOutreachTypeLabel(latestUnsent.type)} ${outreachConfig.labels.contactStatusReadySuffix}`;
}

export function contactOutreachStatus(
  assets: OutreachRow[],
  contactId: string,
): string {
  const messages = messagesForContact(assets, contactId);
  if (messages.length === 0) return outreachConfig.labels.contactStatusNone;
  const ready = contactOutreachReadyLabel(assets, contactId);
  if (ready) return ready;
  const sent = [...messages].reverse().find((asset) => asset.sentAt);
  if (sent?.sentAt) {
    return `${outreachConfig.labels.sentStatus} ${todayInputValue(sent.sentAt)}`;
  }
  return outreachConfig.labels.contactStatusNone;
}

const outreachFieldClass =
  "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";

export function AddContactForm({
  campaignId,
  roles,
  action,
  applications,
}: {
  campaignId: string;
  roles: Array<{ id: string; name: string; campaignId?: string | null }>;
  applications?: Array<{ id: string; name: string }>;
  action: (formData: FormData) => void;
}) {
  const applicationLocked = campaignId.trim().length > 0;
  const [chosenCampaignId, setChosenCampaignId] = useState(campaignId);
  const visibleRoles = roles.filter(
    (role) => !role.campaignId || role.campaignId === chosenCampaignId,
  );
  return (
    <form
      action={action}
      className="grid gap-3 md:grid-cols-2"
      data-testid="add-application-contact"
    >
      {applicationLocked ? (
        <input type="hidden" name="campaignId" value={campaignId} />
      ) : (
        <label className="text-sm md:col-span-2">
          <span className="font-medium text-ink">{vocab.campaign.Singular}</span>
          <select
            name="campaignId"
            required
            value={chosenCampaignId}
            data-testid="add-contact-application"
            className={outreachFieldClass}
            onChange={(event) => setChosenCampaignId(event.target.value)}
          >
            <option value="">{`Choose ${vocab.campaign.aSingular}`}</option>
            {(applications ?? []).map((application) => (
              <option key={application.id} value={application.id}>
                {application.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-sm">
        <span className="font-medium text-ink">
          {outreachConfig.labels.fieldFirstName}
        </span>
        <input name="firstName" required className={outreachFieldClass} />
      </label>
      <label className="text-sm">
        <span className="font-medium text-ink">
          {outreachConfig.labels.fieldLastName}
        </span>
        <input name="lastName" required className={outreachFieldClass} />
      </label>
      <label className="text-sm">
        <span className="font-medium text-ink">
          {outreachConfig.labels.fieldTitle}
        </span>
        <input name="title" required className={outreachFieldClass} />
      </label>
      <label className="text-sm">
        <span className="font-medium text-ink">
          {outreachConfig.labels.fieldEmail}
        </span>
        <input name="email" type="email" className={outreachFieldClass} />
      </label>
      <label className="text-sm md:col-span-2">
        <span className="font-medium text-ink">
          {outreachConfig.labels.fieldLinkedIn}
        </span>
        <input name="linkedinUrl" className={outreachFieldClass} />
      </label>
      <label className="text-sm md:col-span-2">
        <span className="font-medium text-ink">
          {outreachConfig.labels.pasteInterviewerProfile}
        </span>
        <textarea name="linkedInProfileText" rows={5} className={outreachFieldClass} />
        <span className="mt-1 block text-xs text-muted">
          {outreachConfig.labels.pasteInterviewerProfileHelp}
        </span>
      </label>
      <label className="text-sm md:col-span-2">
        <span className="font-medium text-ink">
          {outreachConfig.labels.assignRole}
        </span>
        <select
          key={chosenCampaignId || "none"}
          name="personaId" required
          defaultValue=""
          disabled={!chosenCampaignId}
          className={outreachFieldClass}
        >
          <option value="" disabled>
            {visibleRoles.length === 0
              ? `No ${vocab.persona.plural} yet`
              : `Choose ${vocab.persona.aSingular}`}
          </option>
          {visibleRoles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton>Add {vocab.contact.singular}</SubmitButton>
    </form>
  );
}

export function ApplicationContactsPageHeader({
  campaignId,
  roles,
  canEdit,
  title,
  description,
  backHref,
  applications,
  trailingActions,
}: {
  campaignId: string;
  roles: Array<{ id: string; name: string; campaignId?: string | null }>;
  canEdit: boolean;
  title: string;
  description: string;
  backHref?: string | null;
  applications?: Array<{ id: string; name: string }>;
  trailingActions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(addApplicationContactAction, initial);
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {canEdit ? (
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => setOpen(true)}
                data-testid="contacts-page-add-contact"
              >
                {outreachConfig.labels.addContact}
              </AppButton>
            ) : null}
            {backHref ? (
              <AppActionLink
                href={backHref}
                data-testid="contacts-page-back-to-application"
              >
                {polishCopy.backToDashboard}
              </AppActionLink>
            ) : null}
            {trailingActions}
          </>
        }
      />
      {canEdit && open ? (
        <AddContactForm
          campaignId={campaignId}
          roles={roles}
          applications={applications}
          action={action}
        />
      ) : null}
      <Status result={state} />
    </>
  );
}

export function ApplicationAppliedSection({
  campaignId,
  canEdit,
  appliedAt,
  applicationProgress,
}: {
  campaignId: string;
  canEdit: boolean;
  appliedAt: string | null;
  applicationProgress: keyof typeof interviewConfig.progress | null;
}) {
  const [state, action] = useActionState(markApplicationAppliedAction, initial);
  const [progressState, progressAction] = useActionState(
    setApplicationProgressAction,
    initial,
  );
  const router = useRouter();
  useEffect(() => {
    if (state?.ok || progressState?.ok) router.refresh();
  }, [state, progressState, router]);
  return (
    <section
      className={`space-y-3 rounded-lg border border-edge bg-surface p-5 ${WORKSPACE_CARD_WRAP_CLASS}`}
      data-testid="application-applied"
    >
      <div>
        <h2 className="text-base font-semibold text-ink">
          {outreachConfig.labels.appliedTitle}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {outreachConfig.labels.appliedHelp}
        </p>
      </div>
      <p
        className="text-sm font-medium text-ink"
        data-testid="application-status"
      >
        {applicationProgress
          ? interviewConfig.progress[applicationProgress]
          : appliedAt
            ? `${outreachConfig.labels.appliedStatus} ${todayInputValue(appliedAt)}`
            : outreachConfig.labels.notAppliedStatus}
      </p>
      {canEdit ? (
        <form action={action} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="campaignId" value={campaignId} />
          <label className="text-sm">
            <span className="font-medium text-ink">Date</span>
            <input
              type="date"
              name="appliedAt"
              defaultValue={todayInputValue(appliedAt)}
              className="mt-1 block rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </label>
          <SubmitButton>{outreachConfig.labels.appliedStatus}</SubmitButton>
        </form>
      ) : null}
      {canEdit ? (
        <form action={progressAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="campaignId" value={campaignId} />
          <label className="text-sm">
            <span className="font-medium text-ink">
              {interviewConfig.labels.progressTitle}
            </span>
            <select
              name="progress"
              defaultValue={applicationProgress ?? ""}
              className="mt-1 block rounded-md border border-edge-strong px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {Object.entries(interviewConfig.progress).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton>{interviewConfig.labels.progressTitle}</SubmitButton>
        </form>
      ) : null}
      <Status result={state} />
      <Status result={progressState} />
    </section>
  );
}

export function ApplicationContactsSection({
  campaignId,
  canEdit,
  roles,
  contacts,
  assets = [],
  interviewStages = [],
}: {
  campaignId: string;
  canEdit: boolean;
  roles: RoleOption[];
  contacts: ContactRow[];
  assets?: OutreachRow[];
  interviewStages?: InterviewStageRow[];
}) {
  return (
    <ApplicationOutreachSection
      campaignId={campaignId}
      canEdit={canEdit}
      roles={roles}
      contacts={contacts}
      assets={assets}
      interviewStages={interviewStages}
      approvedResumeId={null}
    />
  );
}

export function ApplicationOutreachSection({
  campaignId,
  canEdit,
  roles,
  contacts,
  assets,
  interviewStages = [],
  approvedResumeId,
  emailSignature = null,
}: {
  campaignId: string;
  canEdit: boolean;
  roles: RoleOption[];
  contacts: ContactRow[];
  assets: OutreachRow[];
  interviewStages?: InterviewStageRow[];
  approvedResumeId: string | null;
  emailSignature?: string | null;
}) {
  const [addState, addAction] = useActionState(
    addApplicationContactAction,
    initial,
  );
  const [roleState, roleAction] = useActionState(
    updateApplicationContactRoleAction,
    initial,
  );
  const [generateState, generateAction] = useActionState(
    generateOutreachAssetAction,
    initial,
  );
  const [sentState, sentAction] = useActionState(
    markOutreachSentAction,
    initial,
  );
  const router = useRouter();
  useEffect(() => {
    if (addState?.ok || roleState?.ok || generateState?.ok || sentState?.ok) router.refresh();
  }, [addState, roleState, generateState, sentState, router]);
  const [selectedId, setSelectedId] = useState(contacts[0]?.contactId ?? "");
  const [explicitAssetId, setExplicitAssetId] = useState<string | null>(null);
  const [generatorKind, setGeneratorKind] =
    useState<OutreachGeneratorKind>("EMAIL");
  const [showAddContact, setShowAddContact] = useState(false);
  const selected =
    contacts.find((contact) => contact.contactId === selectedId) ??
    contacts[0] ??
    null;
  const selectedMessages = selected
    ? messagesForContact(assets, selected.contactId)
    : [];
  const openedMessage =
    selectedMessages.find((asset) => asset.id === explicitAssetId) ??
    selectedMessages.find((asset) => asset.id === generateState?.assetId) ??
    selectedMessages[selectedMessages.length - 1] ??
    null;
  const lastSent = [...selectedMessages].reverse().find((asset) => asset.sentAt);
  const thankYouSelected = generatorKind === "INTERVIEW_THANK_YOU";
  const fieldClass =
    "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
  function openContact(contactId: string, assetId?: string) {
    setSelectedId(contactId);
    setExplicitAssetId(assetId ?? null);
  }

  function openAddContact() {
    setShowAddContact(true);
  }

  return (
    <section
      className={`space-y-4 rounded-lg border border-edge bg-surface p-5 ${WORKSPACE_CARD_WRAP_CLASS}`}
      data-testid="application-outreach"
    >
      <div>
        <h2 className="text-base font-semibold text-ink">
          {outreachConfig.labels.sectionTitle}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {outreachConfig.labels.sectionHelp}
        </p>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <AppButton
            type="button"
            variant="secondary"
            onClick={openAddContact}
            data-testid="add-contact-top"
          >
            {outreachConfig.labels.addContact}
          </AppButton>
        </div>
      ) : null}

      {canEdit
        ? interviewStages
            .filter(
              (stage) =>
                Boolean(stage.notesAfter?.trim()) &&
                Boolean(stage.interviewerContactId),
            )
            .map((stage) => {
              const clarify = stageThankYouClarify(stage);
              const contactId = stage.interviewerContactId!;
              const personaId =
                stage.personaId ??
                contacts.find((row) => row.contactId === contactId)?.personaId ??
                roles[0]?.id ??
                "";
              return (
                <div
                  key={stage.id}
                  className="space-y-3 rounded-md border border-edge bg-canvas p-4"
                  data-testid={`outreach-stage-followup-${stage.id}`}
                >
                  <h3 className="text-sm font-semibold text-ink">
                    {interviewStageLabel(stage)}
                  </h3>
                  {clarify.needsAnswers ? (
                    <ApplicationActionForm
                      action={generateOutreachAssetAction}
                      submitLabel={
                        interviewConfig.labels.answerThankYouQuestions
                      }
                      testId={`thank-you-answers-${stage.id}`}
                    >
                      <input type="hidden" name="campaignId" value={campaignId} />
                      <input
                        type="hidden"
                        name="interviewStageId"
                        value={stage.id}
                      />
                      <input type="hidden" name="contactId" value={contactId} />
                      <input type="hidden" name="personaId" value={personaId} />
                      <input type="hidden" name="type" value="EMAIL" />
                      <input type="hidden" name="purpose" value="THANK_YOU" />
                      <p className="text-sm text-muted">
                        {interviewConfig.labels.thankYouClarifyHelp}
                      </p>
                      {clarify.questions.map((question) => (
                        <label key={question.id} className="text-sm">
                          {question.text}
                          <input
                            type="hidden"
                            name="thankYouAnswerId"
                            value={question.id}
                          />
                          <textarea
                            name="thankYouAnswer"
                            rows={2}
                            className={fieldClass}
                          />
                        </label>
                      ))}
                    </ApplicationActionForm>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <ApplicationActionForm
                      action={generateOutreachAssetAction}
                      submitLabel={interviewConfig.labels.thankYouEmail}
                      testId={`thank-you-email-${stage.id}`}
                    >
                      <input type="hidden" name="campaignId" value={campaignId} />
                      <input
                        type="hidden"
                        name="interviewStageId"
                        value={stage.id}
                      />
                      <input type="hidden" name="contactId" value={contactId} />
                      <input type="hidden" name="personaId" value={personaId} />
                      <input type="hidden" name="type" value="EMAIL" />
                      <input type="hidden" name="purpose" value="THANK_YOU" />
                      {clarify.needsAnswers ? (
                        <input
                          type="hidden"
                          name="skipThankYouQuestions"
                          value="1"
                        />
                      ) : null}
                    </ApplicationActionForm>
                    <ApplicationActionForm
                      action={generateOutreachAssetAction}
                      submitLabel={interviewConfig.labels.thankYouLinkedIn}
                      testId={`thank-you-linkedin-${stage.id}`}
                    >
                      <input type="hidden" name="campaignId" value={campaignId} />
                      <input
                        type="hidden"
                        name="interviewStageId"
                        value={stage.id}
                      />
                      <input type="hidden" name="contactId" value={contactId} />
                      <input type="hidden" name="personaId" value={personaId} />
                      <input type="hidden" name="type" value="LINKEDIN_INMAIL" />
                      <input type="hidden" name="purpose" value="THANK_YOU" />
                      {clarify.needsAnswers ? (
                        <input
                          type="hidden"
                          name="skipThankYouQuestions"
                          value="1"
                        />
                      ) : null}
                    </ApplicationActionForm>
                    <ApplicationActionForm
                      action={generateOutreachAssetAction}
                      submitLabel={interviewConfig.labels.checkIn}
                      testId={`check-in-${stage.id}`}
                    >
                      <input type="hidden" name="campaignId" value={campaignId} />
                      <input
                        type="hidden"
                        name="interviewStageId"
                        value={stage.id}
                      />
                      <input type="hidden" name="contactId" value={contactId} />
                      <input type="hidden" name="personaId" value={personaId} />
                      <input type="hidden" name="type" value="EMAIL" />
                      <input type="hidden" name="purpose" value="CHECK_IN" />
                    </ApplicationActionForm>
                  </div>
                </div>
              );
            })
        : null}

      {canEdit && showAddContact ? (
        <AddContactForm
          campaignId={campaignId}
          roles={roles}
          action={addAction}
        />
      ) : null}
      <Status result={addState} />

      <div
        className="grid gap-4 lg:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]"
        data-testid="application-contacts"
      >
        <nav
          aria-label={outreachConfig.labels.contactsTitle}
          className="rounded-md border border-edge bg-canvas p-2"
        >
          <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-subtle">
            {vocab.contact.Plural}
          </p>
          {contacts.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted">
              No contacts on this {vocab.campaign.singular} yet.
            </p>
          ) : (
            <ul className="mt-1 space-y-1">
              {contacts.map((contact) => {
                const active = contact.contactId === selected?.contactId;
                const sent = sentMessagesForContact(assets, contact.contactId);
                const status = contactOutreachStatus(assets, contact.contactId);
                const ready = contactOutreachReadyLabel(
                  assets,
                  contact.contactId,
                );
                return (
                  <li key={contact.contactId}>
                    <div
                      className={`rounded-md ${
                        active ? "ring-1 ring-edge-strong" : ""
                      }`}
                      data-testid={`outreach-contact-${contact.contactId}`}
                    >
                      <AppButton
                        type="button"
                        variant="secondary"
                        onClick={() => openContact(contact.contactId)}
                        className="w-full !justify-start"
                      >
                        <span className="block min-w-0 text-left">
                          <span className="block truncate font-medium">
                            {contactName(contact)}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-subtle">
                            {contact.title ?? "—"}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-ink">
                            {contact.personaName ??
                              outreachConfig.labels.assignRole}
                          </span>
                        </span>
                      </AppButton>
                      {canEdit ? (
                        <div className="px-2 pb-2">
                          <AppActionLink
                            href={workspaceContactEditHref(
                              contact.contactId,
                              campaignId,
                            )}
                            variant="chip"
                            data-testid={`edit-contact-${contact.contactId}`}
                          >
                            {outreachConfig.labels.editContact}
                          </AppActionLink>
                        </div>
                      ) : null}
                      {ready ? (
                        <p
                          className="px-3 pb-1 text-xs font-medium text-success"
                          data-testid={`outreach-contact-ready-${contact.contactId}`}
                        >
                          {ready}
                        </p>
                      ) : null}
                      {sent.length > 0 ? (
                        <ul
                          className="space-y-0.5 px-2 pb-2"
                          data-testid={`outreach-contact-history-${contact.contactId}`}
                        >
                          {sent.map((asset) => (
                            <li key={asset.id}>
                              <AppButton
                                type="button"
                                variant="secondary"
                                data-testid={`outreach-history-${asset.id}`}
                                onClick={() =>
                                  openContact(contact.contactId, asset.id)
                                }
                                className={`w-full !justify-start !px-2 !py-1 text-xs ${
                                  openedMessage?.id === asset.id
                                    ? "ring-1 ring-edge-strong"
                                    : ""
                                }`}
                              >
                                {asset.sentAt
                                  ? formatOutreachHistoryLine(
                                      asset.type,
                                      asset.sentAt,
                                    )
                                  : outreachConfig.labels.contactStatusDraft}
                              </AppButton>
                            </li>
                          ))}
                        </ul>
                      ) : status !== ready ? (
                        <p
                          className="px-3 pb-2 text-xs text-subtle"
                          data-testid={`outreach-contact-status-${contact.contactId}`}
                        >
                          {status}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {selected ? (
          <div className="space-y-4" data-testid="outreach-sequence">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  {contactName(selected)}
                </h3>
                <p className="text-sm text-muted">
                  {selected.title ?? "—"}
                  {selected.personaName ? ` · ${selected.personaName}` : ""}
                </p>
              </div>
              {canEdit ? (
                <AppActionLink
                  href={workspaceContactEditHref(
                    selected.contactId,
                    campaignId,
                  )}
                  variant="chip"
                  data-testid={`edit-selected-contact-${selected.contactId}`}
                >
                  {outreachConfig.labels.editContact}
                </AppActionLink>
              ) : null}
            </div>
            {canEdit ? (
              <form
                key={`role-${selected.contactId}`}
                action={roleAction}
                className="flex flex-wrap items-end gap-2"
                data-testid="outreach-save-role"
              >
                <input type="hidden" name="campaignId" value={campaignId} />
                <input
                  type="hidden"
                  name="contactId"
                  value={selected.contactId}
                />
                <label className="text-sm">
                  <span className="font-medium text-ink">
                    {outreachConfig.labels.assignRole}
                  </span>
                  <select
                    name="personaId"
                    defaultValue={selected.personaId ?? ""}
                    required
                    className="mt-1 block rounded-md border border-edge-strong px-3 py-2 text-sm"
                    data-testid="outreach-role-select"
                  >
                    <option value="" disabled>
                      Choose {vocab.persona.aSingular}
                    </option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <SubmitButton>Save role</SubmitButton>
              </form>
            ) : null}
            <Status result={roleState} />

            {openedMessage ? (
              <OutreachMessageCard
                key={openedMessage.id}
                campaignId={campaignId}
                canEdit={canEdit}
                asset={openedMessage}
                contacts={contacts}
                approvedResumeId={approvedResumeId}
                sentAction={sentAction}
                generateAction={generateAction}
                emailSignature={emailSignature}
              />
            ) : (
              <p className="text-sm text-muted">
                {outreachConfig.labels.contactStatusNone}
              </p>
            )}
            <Status result={sentState} />

            {canEdit ? (
                <form
                  key={`generate-${selected.contactId}`}
                  action={generateAction}
                  onSubmit={() => {
                    setExplicitAssetId(null);
                  }}
                  className="grid gap-3 md:grid-cols-2"
                  data-testid="add-next-outreach"
                >
                  <input type="hidden" name="campaignId" value={campaignId} />
                  <input
                    type="hidden"
                    name="contactId"
                    value={selected.contactId}
                  />
                  <input
                    type="hidden"
                    name="personaId"
                    value={selected.personaId ?? ""}
                  />
                  <input
                    type="hidden"
                    name="purpose"
                    value={
                      thankYouSelected
                        ? "THANK_YOU"
                        : lastSent
                          ? "FOLLOW_UP"
                          : "PROACTIVE"
                    }
                  />
                  {lastSent && !thankYouSelected ? (
                    <input
                      type="hidden"
                      name="followUpToAssetId"
                      value={lastSent.id}
                    />
                  ) : null}
                  <div className="md:col-span-2">
                    <h4 className="text-sm font-semibold text-ink">
                      {outreachConfig.labels.generatorTitle}
                    </h4>
                  </div>
                  <label className="text-sm">
                    <span className="font-medium text-ink">
                      {outreachConfig.labels.addNextMessage}
                    </span>
                    <select
                      name="kind"
                      value={generatorKind}
                      onChange={(event) => {
                        const next = event.target.value;
                        if (
                          next === "EMAIL" ||
                          next === "LINKEDIN_CONNECTION_NOTE" ||
                          next === "LINKEDIN_INMAIL" ||
                          next === "INTERVIEW_THANK_YOU"
                        ) {
                          setGeneratorKind(next);
                        }
                      }}
                      className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
                      data-testid="outreach-generator-kind"
                    >
                      {GENERATOR_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {formatOutreachGeneratorKindLabel(kind)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {thankYouSelected ? (
                    <label className="text-sm">
                      <span className="font-medium text-ink">
                        {outreachConfig.labels.interviewStage}
                      </span>
                      <select
                        name="interviewStageId"
                        required
                        defaultValue=""
                        className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
                        data-testid="outreach-generator-stage"
                      >
                        <option value="" disabled>
                          {interviewStages.length === 0
                            ? outreachConfig.labels.needInterviewStage
                            : outreachConfig.labels.interviewStage}
                        </option>
                        {interviewStages.map((stage) => (
                          <option key={stage.id} value={stage.id}>
                            {interviewStageLabel(stage)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label
                    className={`text-sm ${thankYouSelected ? "md:col-span-2" : ""}`}
                  >
                    <span className="font-medium text-ink">
                      {outreachConfig.labels.generatorPrompt}
                    </span>
                    <textarea
                      name="regenerationInstruction"
                      rows={3}
                      className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
                      data-testid="outreach-generator-prompt"
                      aria-describedby="outreach-generator-prompt-help"
                    />
                    <span
                      id="outreach-generator-prompt-help"
                      className="mt-1 block text-xs text-muted"
                    >
                      {outreachConfig.labels.generatorPromptHelp}
                    </span>
                  </label>
                  <SubmitButton>{outreachConfig.labels.generate}</SubmitButton>
                </form>
            ) : null}
            <Status result={generateState} suppressJobFailure />
          </div>
        ) : null}
      </div>

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <AppButton
            type="button"
            variant="secondary"
            onClick={openAddContact}
            data-testid="add-contact-bottom"
          >
            {outreachConfig.labels.addContact}
          </AppButton>
        </div>
      ) : null}
    </section>
  );
}

function parsedContent(value: unknown): ApplicationAssetContent | null {
  const parsed = applicationAssetContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function OutreachSentControl({
  campaignId,
  asset,
  sentAction,
  formRef,
  dateRef,
}: {
  campaignId: string;
  asset: OutreachRow;
  sentAction: (formData: FormData) => void;
  formRef: RefObject<HTMLFormElement | null>;
  dateRef: RefObject<HTMLInputElement | null>;
}) {
  if (asset.sentAt) {
    return (
      <p
        className="self-center text-sm text-ink"
        data-testid={`outreach-sent-date-${asset.id}`}
      >
        {outreachConfig.labels.sentStatus} {todayInputValue(asset.sentAt)}
      </p>
    );
  }
  return (
    <form
      ref={formRef}
      action={sentAction}
      className="flex flex-wrap items-end gap-2"
      data-testid={`outreach-mark-sent-${asset.id}`}
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="assetId" value={asset.id} />
      <label className="text-sm">
        <span className="font-medium text-ink">Sent date</span>
        <input
          ref={dateRef}
          type="date"
          name="sentAt"
          defaultValue={todayInputValue()}
          className="mt-1 block rounded-md border border-edge-strong px-3 py-2 text-sm"
        />
      </label>
      <SubmitButton>{outreachConfig.labels.markSent}</SubmitButton>
    </form>
  );
}

export function OutreachMessageCard({
  campaignId,
  canEdit,
  asset,
  contacts,
  approvedResumeId,
  sentAction,
  generateAction,
  emailSignature = null,
}: {
  campaignId: string;
  canEdit: boolean;
  asset: OutreachRow;
  contacts: ContactRow[];
  approvedResumeId: string | null;
  sentAction: (formData: FormData) => void;
  generateAction: (formData: FormData) => void;
  emailSignature?: string | null;
}) {
  const content = parsedContent(asset.content);
  const composed = content
    ? composeOutreachText(content, { emailSignature })
    : null;
  const [editState, editAction, editPending] = useActionState(
    saveOutreachMessageEditAction,
    initial,
  );
  const router = useRouter();
  useEffect(() => {
    if (editState?.ok) router.refresh();
  }, [editState, router]);
  const contact =
    contacts.find((row) => row.contactId === asset.contactId) ?? null;
  const [copied, setCopied] = useState<string | null>(null);
  const [askSent, setAskSent] = useState(false);
  const sentFormRef = useRef<HTMLFormElement>(null);
  const sentDateRef = useRef<HTMLInputElement>(null);
  const savedEdit =
    editState?.ok && editState.assetId === asset.id && editState.body != null
      ? { subject: editState.subject ?? null, body: editState.body }
      : null;
  const shown = savedEdit ?? composed;
  const handoff = shown
    ? outreachEmailHandoff({
        to: contact?.email ?? "",
        subject: shown.subject ?? "",
        body: shown.body,
      })
    : null;
  const [draftSubject, setDraftSubject] = useState(shown?.subject ?? "");
  const [draftBody, setDraftBody] = useState(shown?.body ?? "");
  const shownKey = shown
    ? `${asset.id}\0${shown.subject ?? ""}\0${shown.body}`
    : asset.id;
  const [appliedShownKey, setAppliedShownKey] = useState<string | null>(null);
  if (shown && shownKey !== appliedShownKey) {
    setAppliedShownKey(shownKey);
    setDraftSubject(shown.subject ?? "");
    setDraftBody(shown.body);
  }
  const regenerateKind: OutreachGeneratorKind =
    asset.purpose === "THANK_YOU" ? "INTERVIEW_THANK_YOU" : asset.type;

  function promptIfUnsent() {
    if (asset.sentAt) return;
    setAskSent(true);
  }

  function openEmailOption(href: string | null | undefined) {
    if (!href) return;
    openEmailClientHref(href);
    promptIfUnsent();
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      promptIfUnsent();
    } catch (error) {
      setCopied(null);
      console.error(
        JSON.stringify({
          event: "outreach_copy_failed",
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  function confirmSentToday() {
    if (sentDateRef.current) {
      sentDateRef.current.value = todayInputValue();
    }
    sentFormRef.current?.requestSubmit();
  }

  return (
    <article
      className={`space-y-3 rounded-md border border-edge p-4 ${WORKSPACE_CARD_WRAP_CLASS}`}
      data-testid="outreach-message"
    >
      <p className="text-sm font-medium text-ink">
        {formatOutreachTypeLabel(asset.type)}
        {asset.sentAt
          ? ` · ${outreachConfig.labels.sentStatus} ${todayInputValue(asset.sentAt)}`
          : ` · ${outreachConfig.labels.contactStatusDraft}`}
      </p>
      {shown && canEdit ? (
        <form
          action={editAction}
          className={`space-y-2 text-sm text-ink ${WORKSPACE_MESSAGE_WRAP_CLASS}`}
          data-testid={`outreach-edit-${asset.id}`}
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="assetId" value={asset.id} />
          {shown.subject != null ? (
            <label className="block">
              <span className="font-medium">{outreachConfig.labels.messageSubject}</span>
              <input
                name="subject"
                value={draftSubject}
                onChange={(event) => setDraftSubject(event.target.value)}
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
                data-testid={`outreach-edit-subject-${asset.id}`}
              />
            </label>
          ) : null}
          <label className="block">
            <span className="sr-only">Message</span>
            <textarea
              name="body"
              value={draftBody}
              onChange={(event) => setDraftBody(event.target.value)}
              rows={12}
              className="mt-1 w-full whitespace-pre-wrap rounded-md border border-edge-strong px-3 py-2 font-sans"
              data-testid={`outreach-edit-body-${asset.id}`}
            />
          </label>
          <AppButton type="submit" disabled={editPending}>
            {editPending
              ? "Saving…"
              : outreachConfig.labels.saveMessage}
          </AppButton>
          {editState && editState.assetId === asset.id ? (
            <p
              role="status"
              className={editState.ok ? "text-sm text-success" : "text-sm text-danger"}
            >
              {editState.message}
            </p>
          ) : null}
        </form>
      ) : shown ? (
        <div
          className={`space-y-2 text-sm text-ink ${WORKSPACE_MESSAGE_WRAP_CLASS}`}
        >
          {shown.subject ? (
            <p>
              <span className="font-medium">Subject:</span> {shown.subject}
            </p>
          ) : null}
          <pre className="whitespace-pre-wrap font-sans">{shown.body}</pre>
        </div>
      ) : (
        <p className={`text-sm text-danger ${WORKSPACE_MESSAGE_WRAP_CLASS}`}>
          This message could not be displayed.
        </p>
      )}
      {canEdit && shown && asset.type === "EMAIL" && handoff ? (
        <div className="flex flex-wrap items-end gap-2" data-testid="email-handoff">
          <AppButton
            type="button"
            variant="secondary"
            onClick={() => openEmailOption(handoff.outlookWeb.href)}
          >
            {outreachConfig.labels.openOutlookWeb}
          </AppButton>
          <AppButton
            type="button"
            variant="secondary"
            onClick={() => openEmailOption(handoff.outlookDesktop.href)}
          >
            {outreachConfig.labels.openOutlookDesktop}
          </AppButton>
          <AppButton
            type="button"
            variant="secondary"
            onClick={() => openEmailOption(handoff.gmailWeb.href)}
          >
            {outreachConfig.labels.openGmail}
          </AppButton>
          <AppButton
            type="button"
            variant="secondary"
            data-testid={`outreach-copy-body-${asset.id}`}
            onClick={() => void copy("body", shown.body)}
          >
            {outreachConfig.labels.copyBody}
          </AppButton>
          {approvedResumeId ? (
            <AppActionLink href={workspaceAssetDocxHref(approvedResumeId)}>
              {outreachConfig.labels.downloadResume}
            </AppActionLink>
          ) : null}
          <OutreachSentControl
            campaignId={campaignId}
            asset={asset}
            sentAction={sentAction}
            formRef={sentFormRef}
            dateRef={sentDateRef}
          />
          <p className="w-full text-xs text-muted">
            {outreachConfig.labels.attachResumeReminder}
          </p>
        </div>
      ) : null}
      {canEdit && shown && asset.type !== "EMAIL" ? (
        <div className="flex flex-wrap items-end gap-2" data-testid="linkedin-handoff">
          {shown.subject ? (
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => void copy("subject", shown.subject ?? "")}
            >
              {outreachConfig.labels.copySubject}
            </AppButton>
          ) : null}
          <AppButton
            type="button"
            variant="secondary"
            data-testid={`outreach-copy-body-${asset.id}`}
            onClick={() => void copy("body", shown.body)}
          >
            {outreachConfig.labels.copyBody}
          </AppButton>
          {contact?.linkedinUrl ? (
            <AppActionLink
              href={contact.linkedinUrl}
              target="_blank"
              rel="noreferrer"
            >
              {outreachConfig.labels.openLinkedIn}
            </AppActionLink>
          ) : null}
          <OutreachSentControl
            campaignId={campaignId}
            asset={asset}
            sentAction={sentAction}
            formRef={sentFormRef}
            dateRef={sentDateRef}
          />
          {copied ? (
            <span className="text-xs text-success">Copied {copied}.</span>
          ) : null}
        </div>
      ) : null}
      {canEdit ? (
        <form
          action={generateAction}
          className="grid gap-2"
          data-testid={`outreach-regenerate-${asset.id}`}
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="contactId" value={asset.contactId ?? ""} />
          <input type="hidden" name="personaId" value={asset.personaId ?? ""} />
          <input type="hidden" name="kind" value={regenerateKind} />
          <input
            type="hidden"
            name="purpose"
            value={asset.purpose ?? "PROACTIVE"}
          />
          {asset.emailLength ? (
            <input type="hidden" name="emailLength" value={asset.emailLength} />
          ) : null}
          {asset.purpose === "THANK_YOU" ? (
            <input type="hidden" name="skipThankYouQuestions" value="1" />
          ) : null}
          <label className="text-sm">
            <span className="font-medium text-ink">
              {outreachConfig.labels.changeInstruction}
            </span>
            <textarea
              name="regenerationInstruction"
              rows={3}
              required
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
              data-testid={`outreach-regenerate-instruction-${asset.id}`}
            />
          </label>
          <SubmitButton>{outreachConfig.labels.regenerate}</SubmitButton>
        </form>
      ) : null}
      {canEdit && askSent && !asset.sentAt ? (
        <div
          role="dialog"
          aria-labelledby={`did-you-send-title-${asset.id}`}
          className="space-y-2 rounded-md border border-edge bg-canvas p-3"
          data-testid={`did-you-send-${asset.id}`}
        >
          <p id={`did-you-send-title-${asset.id}`} className="text-sm font-medium text-ink">
            {outreachConfig.labels.didYouSendPrompt}
          </p>
          <div className="flex flex-wrap gap-2">
            <AppButton
              type="button"
              data-testid={`did-you-send-yes-${asset.id}`}
              onClick={confirmSentToday}
            >
              {outreachConfig.labels.didYouSendYes}
            </AppButton>
            <AppButton
              type="button"
              variant="secondary"
              data-testid={`did-you-send-not-yet-${asset.id}`}
              onClick={() => setAskSent(false)}
            >
              {outreachConfig.labels.didYouSendNotYet}
            </AppButton>
          </div>
        </div>
      ) : null}
    </article>
  );
}
