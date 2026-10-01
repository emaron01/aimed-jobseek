"use client";

import {
  addInterviewContactAction,
  startPersonPrepAction,
} from "@/app/actions/interview";
import { AdditionalInterviewPrepQa } from "@/components/AdditionalInterviewPrepQa";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { CheatSheetPersonBody } from "@/components/CheatSheetPersonBody";
import { QuestionList } from "@/components/ConsultationThread";
import type { CheatSheetNote } from "@/lib/application-summary/notes";
import type { CheatSheetPersonSection } from "@/lib/application-summary/contract";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import {
  coachItemIdFromCheatSheetTarget,
  harperContactAnchorId,
  personViewListQuestions,
  type HarperInterviewerSection,
} from "@/lib/consultation/harper-layout";
import { interviewConfig, outreachConfig, vocab } from "@/lib/product-config";
import { useMemo, useState } from "react";

type RoleOption = { id: string; name: string };

export function HarperAddInterviewContactForm({
  campaignId,
  roles,
}: {
  campaignId: string;
  roles: RoleOption[];
}) {
  const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
  return (
    <details
      className="rounded-md border border-edge bg-canvas p-3"
      data-testid="harper-add-interview-contact"
    >
      <summary className="cursor-pointer text-sm font-medium text-ink">
        {interviewConfig.labels.addInterviewContact}
      </summary>
      <div className="mt-3">
        <ApplicationActionForm
          action={addInterviewContactAction}
          submitLabel={interviewConfig.labels.addInterviewContact}
          testId="harper-add-interview-contact-submit"
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              {outreachConfig.labels.fieldFirstName}
              <input name="firstName" required className={fieldClass} />
            </label>
            <label className="text-sm">
              {outreachConfig.labels.fieldLastName}
              <input name="lastName" required className={fieldClass} />
            </label>
            <label className="text-sm">
              {outreachConfig.labels.fieldTitle}
              <input name="title" required className={fieldClass} />
            </label>
            <label className="text-sm">
              {vocab.persona.Singular}
              <select name="personaId" required className={fieldClass}>
                <option value="">{vocab.persona.Singular}</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {outreachConfig.labels.fieldEmail}
              <input name="email" type="email" className={fieldClass} />
            </label>
            <label className="text-sm">
              {outreachConfig.labels.fieldLinkedIn}
              <input name="linkedinUrl" className={fieldClass} />
            </label>
            <label className="text-sm md:col-span-2">
              {outreachConfig.labels.pasteInterviewerProfile}
              <textarea
                name="linkedInProfileText"
                rows={5}
                className={fieldClass}
              />
              <span className="mt-1 block text-xs text-muted">
                {outreachConfig.labels.pasteInterviewerProfileHelp}
              </span>
            </label>
          </div>
        </ApplicationActionForm>
      </div>
    </details>
  );
}

export function HarperPersonInlineProfile({
  campaignId,
  canEdit,
  contactId,
  heading,
  sectionKey,
  section,
  notes,
  personaBuilt,
  personaId,
  prepStarted,
  interviewerSection,
  sessionStatus,
  jobsActive,
  additionalPrepQuestions = [],
  generalQuestions = [],
}: {
  campaignId: string;
  canEdit: boolean;
  contactId: string;
  heading: string;
  sectionKey: string;
  section: CheatSheetPersonSection | null;
  notes: CheatSheetNote[];
  personaBuilt: boolean;
  personaId: string;
  prepStarted: boolean;
  interviewerSection: HarperInterviewerSection | null;
  sessionStatus: string;
  jobsActive: boolean;
  additionalPrepQuestions?: ConsultationQaItem[];
  /** Harper's General questions, so a referenced likely question shows that card. */
  generalQuestions?: ConsultationQaItem[];
}) {
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const showReply =
    canEdit &&
    sessionStatus !== "SKIPPED";

  const profileCoachItemIds = useMemo(
    () =>
      (section?.likelyQuestions ?? [])
        .map((item) => item.id?.trim() ?? "")
        .filter(Boolean),
    [section],
  );

  const allInterviewerQuestions = interviewerSection?.questions;
  const coachQaItems = useMemo(() => {
    const questions = allInterviewerQuestions ?? [];
    return questions.filter((item) => {
      const coachId = coachItemIdFromCheatSheetTarget(item.targetKey);
      return Boolean(coachId && profileCoachItemIds.includes(coachId));
    });
  }, [allInterviewerQuestions, profileCoachItemIds]);
  const listQuestions = useMemo(
    () =>
      personViewListQuestions({
        questions: allInterviewerQuestions ?? [],
        profileCoachItemIds,
      }),
    [allInterviewerQuestions, profileCoachItemIds],
  );

  return (
    <section
      id={harperContactAnchorId(contactId)}
      className="space-y-4 rounded-md border border-edge bg-canvas p-4"
      data-testid="harper-person-view"
      data-harper-contact={contactId}
    >
      <h3 className="text-sm font-semibold text-ink">{heading}</h3>
      {canEdit && !prepStarted ? (
        <ApplicationActionForm
          action={startPersonPrepAction}
          submitLabel={interviewConfig.labels.personPrepStart}
          testId={`harper-start-person-prep-${contactId}`}
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="contactId" value={contactId} />
          <input type="hidden" name="personaId" value={personaId} />
        </ApplicationActionForm>
      ) : null}
      <CheatSheetPersonBody
        campaignId={campaignId}
        canEdit={canEdit}
        sectionKey={sectionKey}
        section={section}
        notes={notes}
        personaBuilt={personaBuilt}
        personaId={personaId}
        showCoachAnswerForms
        coachQaItems={coachQaItems}
        jobsActive={jobsActive}
        showReply={showReply}
        generalQuestions={generalQuestions}
      />
      {listQuestions.length > 0 ? (
        <div className="space-y-3" data-testid="harper-person-qa">
          <QuestionList
            campaignId={campaignId}
            canEdit={canEdit}
            questions={listQuestions}
            showReply={showReply}
            pendingTarget={pendingTarget}
            jobsActive={jobsActive}
            onSubmitStart={(replyKey, answer) => {
              setPendingTarget(replyKey);
              void answer;
            }}
          />
        </div>
      ) : null}
      <AdditionalInterviewPrepQa
        campaignId={campaignId}
        questions={additionalPrepQuestions}
        canEdit={canEdit}
        showReply={showReply}
        jobsActive={jobsActive}
      />
    </section>
  );
}
