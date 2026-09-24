"use client";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";

import { useCallback, useMemo, useRef, useState } from "react";
import type { QualificationBucket } from "@prisma/client";
import { EmailSequenceWorkspace } from "@/components/EmailSequenceWorkspace";
import type { OfferConflict } from "@/lib/campaign/offer-validation";
import type { ClaimValidationViolation } from "@/lib/email-generation/claim-validation-contract";
import type { CampaignEmailLength } from "@/lib/campaign/save";
import { sortEmailDraftContactsForSendQueue, pickNextContactAfterSend, CAMPAIGN_QUEUE_COMPLETE_MESSAGE } from "@/lib/campaign/email-draft-contact-order";
import {
  contactDraftListStatus,
  formatEmailDraftContactListLine,
  pickLookaheadContacts,
} from "@/lib/campaign/email-draft-lookahead";
import { QUALIFICATION_BUCKET_LABELS } from "@/lib/workflow/qualification";
import {
  commitLookaheadDraftQuotaAction,
  lookaheadGenerateEmailDraftAction,
  type LookaheadGenerateEmailDraftResult,
} from "@/app/actions/email";
import { vocab } from "@/lib/product-config";

export type EmailDraftsStageContact = {
  campaignContactId: string;
  contactId: string;
  contactName: string;
  contactDetails: string;
  contactEmail: string | null;
  contactStatus: string;
  suppressed: boolean;
  sequenceStopped: boolean;
  sequenceStoppedReason: string | null;
  qualificationBucket: QualificationBucket | null;
  personaOptions: Array<{ id: string; name: string }>;
  resolvedPersonaId: string | null;
  resolvedPersonaName: string | null;
  hasPersonaDecision: boolean;
  needsPersonaConfirmation: boolean;
  suggestedPersonaId: string | null;
  suggestedPersonaName: string | null;
  personaDecisionReason: string | null;
  personalizationTier: "BEST" | "COMPANY" | "THIN";
  personalizationLabel: string;
  personalizationDetail: string;
  personalizationSources: string;
  drafts: Array<{
    id: string;
    sequenceNumber: number;
    subject: string;
    body: string;
    status: "DRAFT" | "APPROVED" | "SENDING" | "SENT" | "SKIPPED" | "NOT_CREATED";
    kind: "INITIAL" | "FOLLOW_UP" | "REPLY";
    source?: "AI" | "AI_LOOKAHEAD" | "MANUAL";
    generationQuotaCommitted?: boolean;
    sentAt: string | null;
    handoffAt: string | null;
    replyClassification:
      | "INTERESTED"
      | "OBJECTION"
      | "REFERRAL"
      | "NOT_NOW"
      | "NOT_INTERESTED"
      | null;
    referralSuggested: boolean;
    emailLength: CampaignEmailLength | null;
    personaId: string | null;
    personalizationTier: "BEST" | "COMPANY" | "THIN" | null;
    personalizationSources: string | null;
    claimConflicts: ClaimValidationViolation[];
    staleReasons?: string[];
  }>;
};

type ContactListFilter = "all" | "ready_to_send";

function mergeLookaheadDraft(
  contact: EmailDraftsStageContact,
  result: LookaheadGenerateEmailDraftResult,
): EmailDraftsStageContact {
  if (
    !result.draftId ||
    !result.subject ||
    !result.body ||
    !result.sequenceNumber ||
    !result.kind
  ) {
    return contact;
  }
  const nextDraft = {
    id: result.draftId,
    sequenceNumber: result.sequenceNumber,
    subject: result.subject,
    body: result.body,
    status: "DRAFT" as const,
    kind: result.kind,
    source: result.source ?? "AI_LOOKAHEAD",
    generationQuotaCommitted: result.generationQuotaCommitted ?? false,
    sentAt: null,
    handoffAt: null,
    replyClassification: null,
    referralSuggested: false,
    emailLength: null,
    personaId: result.personaId ?? null,
    personalizationTier:
      (result.personalizationTier as "BEST" | "COMPANY" | "THIN" | null) ??
      null,
    personalizationSources: result.personalizationSources ?? null,
    claimConflicts: result.claimConflicts ?? [],
  };
  const exists = contact.drafts.some((draft) => draft.id === nextDraft.id);
  return {
    ...contact,
    drafts: exists
      ? contact.drafts.map((draft) =>
          draft.id === nextDraft.id ? { ...draft, ...nextDraft } : draft,
        )
      : [...contact.drafts, nextDraft].sort(
          (left, right) => left.sequenceNumber - right.sequenceNumber,
        ),
  };
}

export function EmailDraftsStage({
  contacts,
  campaignEmailLength,
  offerWarnings,
  emailDeeplinkMaxUrlLength,
  mailboxConnection,
  dailySendUsage,
  readOnly = false,
  emailSignature = null,
  initialCampaignContactId = null,
}: {
  contacts: EmailDraftsStageContact[];
  campaignEmailLength: CampaignEmailLength;
  offerWarnings: OfferConflict[];
  emailDeeplinkMaxUrlLength: number;
  mailboxConnection: {
    status: "CONNECTED" | "RECONNECT_REQUIRED";
    mailboxAddress: string;
  } | null;
  dailySendUsage: {
    used: number;
    warningLimit: number;
    limit: number;
  };
  readOnly?: boolean;
  emailSignature?: string | null;
  /** Deep-link from Home "Review draft" / due list. */
  initialCampaignContactId?: string | null;
}) {
  const [view, setView] = useState<"write" | "compare">("write");
  const [contactFilter, setContactFilter] =
    useState<ContactListFilter>("all");
  const [stageContacts, setStageContacts] = useState(contacts);
  const [contactsProp, setContactsProp] = useState(contacts);
  if (contacts !== contactsProp) {
    setContactsProp(contacts);
    setStageContacts(contacts);
  }
  const [selectedId, setSelectedId] = useState(() => {
    if (
      initialCampaignContactId &&
      contacts.some((row) => row.campaignContactId === initialCampaignContactId)
    ) {
      return initialCampaignContactId;
    }
    return contacts[0]?.campaignContactId ?? "";
  });
  const [preparingIds, setPreparingIds] = useState<Set<string>>(new Set());
  const [queueComplete, setQueueComplete] = useState(false);
  const triggeredReviewKeys = useRef(new Set<string>());
  const lookaheadRunId = useRef(0);

  const visibleContacts = useMemo(() => {
    // Opted-out and excluded contacts cannot be emailed — keep them out of the
    // working list (all filters), not only "Ready to send".
    const working = stageContacts.filter(
      (row) => !row.suppressed && row.contactStatus !== "EXCLUDED",
    );
    const filtered =
      contactFilter === "ready_to_send"
        ? working.filter((row) => row.drafts.length > 0)
        : working;
    return sortEmailDraftContactsForSendQueue(filtered);
  }, [contactFilter, stageContacts]);

  const selected =
    visibleContacts.find((row) => row.campaignContactId === selectedId) ??
    visibleContacts[0] ??
    null;

  const runLookahead = useCallback(
    async (fromCampaignContactId: string, fromDraftId: string) => {
      if (readOnly || view !== "write") return;
      const reviewKey = `${fromCampaignContactId}:${fromDraftId}`;
      if (triggeredReviewKeys.current.has(reviewKey)) return;
      triggeredReviewKeys.current.add(reviewKey);

      const targets = pickLookaheadContacts(
        visibleContacts,
        fromCampaignContactId,
      );
      if (targets.length === 0) return;

      const runId = ++lookaheadRunId.current;
      for (const target of targets) {
        if (runId !== lookaheadRunId.current) break;
        setPreparingIds((current) => new Set(current).add(target.campaignContactId));
        try {
          const result = await lookaheadGenerateEmailDraftAction(
            target.campaignContactId,
          );
          if (!result.ok || result.skipped) continue;
          setStageContacts((current) =>
            current.map((contact) =>
              contact.campaignContactId === target.campaignContactId
                ? mergeLookaheadDraft(contact, result)
                : contact,
            ),
          );
        } finally {
          setPreparingIds((current) => {
            const next = new Set(current);
            next.delete(target.campaignContactId);
            return next;
          });
        }
      }
    },
    [readOnly, view, visibleContacts],
  );

  const commitLookaheadQuotaForContact = useCallback(
    async (campaignContactId: string, contacts: EmailDraftsStageContact[]) => {
      const contact = contacts.find(
        (row) => row.campaignContactId === campaignContactId,
      );
      const uncommitted = contact?.drafts.find(
        (draft) =>
          draft.source === "AI_LOOKAHEAD" &&
          draft.generationQuotaCommitted === false &&
          draft.subject &&
          draft.body,
      );
      if (!uncommitted) return;
      const committed = await commitLookaheadDraftQuotaAction(uncommitted.id);
      if (committed.ok && committed.committed) {
        setStageContacts((current) =>
          current.map((row) =>
            row.campaignContactId === campaignContactId
              ? {
                  ...row,
                  drafts: row.drafts.map((draft) =>
                    draft.id === uncommitted.id
                      ? { ...draft, generationQuotaCommitted: true }
                      : draft,
                  ),
                }
              : row,
          ),
        );
      }
    },
    [],
  );

  const handleSelectContact = useCallback(
    async (campaignContactId: string) => {
      setQueueComplete(false);
      setSelectedId(campaignContactId);
      await commitLookaheadQuotaForContact(campaignContactId, stageContacts);
    },
    [commitLookaheadQuotaForContact, stageContacts],
  );

  const handleSendComplete = useCallback(
    (campaignContactId: string, draftId: string, sentAt: string) => {
      const nextContact = pickNextContactAfterSend(
        visibleContacts,
        campaignContactId,
      );

      setStageContacts((current) => {
        const updated = current.map((contact) =>
          contact.campaignContactId === campaignContactId
            ? {
                ...contact,
                drafts: contact.drafts.map((draft) =>
                  draft.id === draftId
                    ? { ...draft, status: "SENT" as const, sentAt }
                    : draft,
                ),
              }
            : contact,
        );
        if (nextContact) {
          void commitLookaheadQuotaForContact(
            nextContact.campaignContactId,
            updated,
          );
        }
        return updated;
      });

      if (nextContact) {
        setQueueComplete(false);
        setSelectedId(nextContact.campaignContactId);
      } else {
        setSelectedId("");
        setQueueComplete(true);
      }
    },
    [commitLookaheadQuotaForContact, visibleContacts],
  );

  if (contacts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setView("write")}
          className={
            view === "write" ? PRIMARY_BUTTON_CLASS : SECONDARY_BUTTON_CLASS
          }
        >
          Write
        </button>
        <button
          type="button"
          data-testid="compare-drafts-toggle"
          onClick={() => setView("compare")}
          className={
            view === "compare" ? PRIMARY_BUTTON_CLASS : SECONDARY_BUTTON_CLASS
          }
        >
          Compare drafts
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-700">
          <span className="font-medium">Show</span>
          <select
            data-testid="email-contacts-filter"
            value={contactFilter}
            onChange={(event) =>
              setContactFilter(event.target.value as ContactListFilter)
            }
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="all">All {vocab.contact.plural}</option>
            <option value="ready_to_send">Ready to send</option>
          </select>
        </label>
      </div>

      {view === "compare" ? (
        visibleContacts.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
            No drafts are ready to send.
          </p>
        ) : (
          <CampaignDraftCompare
            contacts={visibleContacts}
            preparingIds={preparingIds}
            onOpenInWrite={(campaignContactId) => {
              void handleSelectContact(campaignContactId);
              setView("write");
            }}
          />
        )
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
          <nav
            aria-label={`${vocab.campaign.Singular} ${vocab.contact.plural}`}
            className="rounded-md border border-slate-200 bg-slate-50 p-2"
          >
            <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              {vocab.contact.Plural}
              {contactFilter === "ready_to_send"
                ? ` (${visibleContacts.length})`
                : ""}
            </p>
            {visibleContacts.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-600">
                No drafts are ready to send.
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {visibleContacts.map((row) => {
                  const active =
                    row.campaignContactId === selected?.campaignContactId;
                  const statusLabel = contactDraftListStatus({
                    isPreparing: preparingIds.has(row.campaignContactId),
                    hasPersonaDecision: row.hasPersonaDecision,
                    drafts: row.drafts,
                  });
                  const listLine = formatEmailDraftContactListLine({
                    qualificationLabel: row.qualificationBucket
                      ? QUALIFICATION_BUCKET_LABELS[row.qualificationBucket]
                      : "Not scored",
                    personaName: row.resolvedPersonaName,
                    statusLabel,
                  });
                  return (
                    <li key={row.campaignContactId}>
                      <button
                        type="button"
                        onClick={() => void handleSelectContact(row.campaignContactId)}
                        className={`w-full rounded-md px-2 py-2 text-left text-sm ${
                          active
                            ? "bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-300"
                            : "text-slate-700 hover:bg-white"
                        }`}
                      >
                        <span className="block truncate">{row.contactName}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {row.contactDetails}
                        </span>
                        <span
                          className={`mt-1 block text-xs ${
                            statusLabel === "Ready to review"
                              ? "font-medium text-emerald-700"
                              : statusLabel === "Prepared"
                                ? "text-sky-700"
                                : statusLabel === "Needs persona"
                                  ? "font-medium text-amber-800"
                                  : statusLabel.startsWith("Email ") &&
                                      statusLabel.includes(" sent")
                                    ? "font-medium text-slate-700"
                                    : "text-slate-500"
                          }`}
                          data-testid={`contact-draft-status-${row.campaignContactId}`}
                        >
                          {listLine}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
          {queueComplete ? (
            <section
              data-testid="campaign-queue-complete"
              className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center"
            >
              <p className="text-sm font-medium text-slate-900">
                {CAMPAIGN_QUEUE_COMPLETE_MESSAGE}
              </p>
            </section>
          ) : selected ? (
            <section
              key={selected.campaignContactId}
              className="grid gap-4 rounded-md border border-slate-200 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
            >
              <EmailSequenceWorkspace
                campaignContactId={selected.campaignContactId}
                contactId={selected.contactId}
                contactName={selected.contactName}
                contactDetails={selected.contactDetails}
                contactEmail={selected.contactEmail}
                contactStatus={selected.contactStatus}
                suppressed={selected.suppressed}
                sequenceStopped={selected.sequenceStopped}
                sequenceStoppedReason={selected.sequenceStoppedReason}
                readOnly={readOnly}
                emailDeeplinkMaxUrlLength={emailDeeplinkMaxUrlLength}
                mailboxConnection={mailboxConnection}
                dailySendUsage={dailySendUsage}
                campaignEmailLength={campaignEmailLength}
                emailSignature={emailSignature}
                personaOptions={selected.personaOptions}
                resolvedPersonaId={selected.resolvedPersonaId}
                resolvedPersonaName={selected.resolvedPersonaName}
                hasPersonaDecision={selected.hasPersonaDecision}
                needsPersonaConfirmation={selected.needsPersonaConfirmation}
                suggestedPersonaId={selected.suggestedPersonaId}
                suggestedPersonaName={selected.suggestedPersonaName}
                personaDecisionReason={selected.personaDecisionReason}
                personalizationTier={selected.personalizationTier}
                personalizationLabel={selected.personalizationLabel}
                personalizationDetail={selected.personalizationDetail}
                personalizationSources={selected.personalizationSources}
                initialDrafts={selected.drafts}
                offerWarnings={offerWarnings}
                onDraftOpenedForReview={(draftId) => {
                  void runLookahead(selected.campaignContactId, draftId);
                }}
                onDraftGenerated={(draft) => {
                  setStageContacts((current) =>
                    current.map((contact) =>
                      contact.campaignContactId === selected.campaignContactId
                        ? mergeLookaheadDraft(contact, {
                            ok: true,
                            campaignContactId: selected.campaignContactId,
                            draftId: draft.id,
                            subject: draft.subject,
                            body: draft.body,
                            sequenceNumber: draft.sequenceNumber,
                            kind: draft.kind,
                            generationQuotaCommitted: true,
                            source: "AI",
                          })
                        : contact,
                    ),
                  );
                  void runLookahead(selected.campaignContactId, draft.id);
                }}
                onSendComplete={({ id, sentAt }) => {
                  handleSendComplete(selected.campaignContactId, id, sentAt);
                }}
              />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CampaignDraftCompare({
  contacts,
  preparingIds,
  onOpenInWrite,
}: {
  contacts: EmailDraftsStageContact[];
  preparingIds: Set<string>;
  onOpenInWrite: (campaignContactId: string) => void;
}) {
  const rows = useMemo(
    () =>
      contacts.map((contact) => {
        const draft =
          [...contact.drafts]
            .reverse()
            .find((entry) => entry.subject && entry.body) ?? null;
        return { contact, draft };
      }),
    [contacts],
  );

  return (
    <div
      data-testid="campaign-draft-compare"
      className="grid gap-4 md:grid-cols-2"
    >
      {rows.map(({ contact, draft }) => (
        <article
          key={contact.campaignContactId}
          className="rounded-md border border-slate-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium text-slate-900">
                {contact.contactName}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {contact.contactDetails}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {contactDraftListStatus({
                  isPreparing: preparingIds.has(contact.campaignContactId),
                  drafts: contact.drafts,
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenInWrite(contact.campaignContactId)}
              className={cn(SECONDARY_BUTTON_CLASS, "px-2.5", "!px-2.5", "!py-1.5", "!text-xs")}
            >
              Open in Write
            </button>
          </div>
          {draft ? (
            <>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Subject
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {draft.subject}
              </p>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Body
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {draft.body}
              </p>
              {draft.personalizationSources || contact.personalizationSources ? (
                <p className="mt-3 text-xs text-slate-500">
                  {draft.personalizationSources ??
                    contact.personalizationSources}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No draft yet.</p>
          )}
        </article>
      ))}
    </div>
  );
}
