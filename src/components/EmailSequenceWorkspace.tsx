"use client";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addFollowUpEmailAction,
  draftReplyAction,
  generateEmailDraftAction,
  markEmailDraftSentAction,
  recordEmailClientIntentAction,
  regenerateEmailDraftAction,
  saveEmailDraftAction,
  sendEmailDraftConnectedAction,
  type GenerateEmailDraftActionResult,
} from "@/app/actions/email";
import { stopSequenceAction, restoreSequenceAction } from "@/app/actions/cadence";
import { ADDITIONAL_GUIDANCE_MAX_CHARS } from "@/lib/email-generation/prompt";
import { PROSPECT_REPLY_MAX_CHARS } from "@/lib/email-generation/reply-contract";
import type { OfferConflict } from "@/lib/campaign/offer-validation";
import type { ClaimValidationViolation } from "@/lib/email-generation/claim-validation-contract";
import {
  EMAIL_LENGTH_OPTIONS,
  emailLengthLabel,
  type CampaignEmailLength,
} from "@/lib/campaign/save";
import {
  appendEmailSignature,
  buildEmailClientLaunch,
  EMAIL_BODY_MAX_CHARS,
  EMAIL_SUBJECT_MAX_CHARS,
  openEmailClientHref,
  type EmailClient,
} from "@/lib/email-generation/email-body";
import { formatDraftStalenessMessage } from "@/lib/email-generation/draft-staleness";
import { SuppressContactForm } from "@/components/SuppressContactForm";
import { EmailGuidancePromptExamples } from "@/components/EmailGuidancePromptExamples";
import {
  deeplinkSendDeclinedStorageKey,
  formatDailySendAdvisory,
} from "@/lib/usage/send-advisory";

type SequenceDraft = {
  id: string;
  sequenceNumber: number;
  subject: string;
  body: string;
  status: "DRAFT" | "APPROVED" | "SENDING" | "SENT" | "SKIPPED" | "NOT_CREATED";
  kind: "INITIAL" | "FOLLOW_UP" | "REPLY";
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
};

const EMAIL_CLIENT_OPTIONS: Array<{
  client: EmailClient;
  label: string;
}> = [
  { client: "OUTLOOK_WEB", label: "Outlook Web" },
  { client: "OUTLOOK_DESKTOP", label: "Outlook desktop" },
  { client: "GMAIL_WEB", label: "Gmail" },
];

function sequenceDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function sequenceActivity(draft: SequenceDraft): string {
  if (draft.sentAt) return `Sent ${sequenceDate(draft.sentAt)}`;
  if (draft.handoffAt) return `Opened ${sequenceDate(draft.handoffAt)}`;
  return "";
}

export function EmailSequenceWorkspace({
  campaignContactId,
  contactId,
  contactName,
  contactDetails,
  contactEmail,
  contactStatus,
  suppressed = false,
  readOnly = false,
  initialDrafts,
  offerWarnings,
  emailDeeplinkMaxUrlLength,
  mailboxConnection,
  dailySendUsage,
  personaOptions = [],
  resolvedPersonaId = null,
  resolvedPersonaName = null,
  hasPersonaDecision = true,
  needsPersonaConfirmation = false,
  suggestedPersonaId = null,
  suggestedPersonaName = null,
  personaDecisionReason = null,
  personalizationTier = "THIN",
  personalizationLabel = "Persona and product only",
  personalizationDetail = "No usable company or contact research.",
  personalizationSources = "No company research available. No contact research available.",
  campaignEmailLength = "MEDIUM",
  sequenceStopped = false,
  sequenceStoppedReason = null,
  emailSignature = null,
  onDraftOpenedForReview,
  onDraftGenerated,
  onSendComplete,
}: {
  campaignContactId: string;
  contactId: string;
  contactName: string;
  contactDetails: string;
  contactEmail: string | null;
  contactStatus: string;
  suppressed?: boolean;
  readOnly?: boolean;
  initialDrafts: SequenceDraft[];
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
  personaOptions?: Array<{ id: string; name: string }>;
  resolvedPersonaId?: string | null;
  resolvedPersonaName?: string | null;
  hasPersonaDecision?: boolean;
  needsPersonaConfirmation?: boolean;
  suggestedPersonaId?: string | null;
  suggestedPersonaName?: string | null;
  personaDecisionReason?: string | null;
  personalizationTier?: "BEST" | "COMPANY" | "THIN";
  personalizationLabel?: string;
  personalizationDetail?: string;
  personalizationSources?: string;
  campaignEmailLength?: CampaignEmailLength;
  sequenceStopped?: boolean;
  sequenceStoppedReason?: string | null;
  emailSignature?: string | null;
  onDraftOpenedForReview?: (draftId: string) => void;
  onDraftGenerated?: (draft: {
    id: string;
    subject: string;
    body: string;
    sequenceNumber: number;
    kind: "INITIAL" | "FOLLOW_UP" | "REPLY";
  }) => void;
  onSendComplete?: (draft: { id: string; sentAt: string }) => void;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(initialDrafts);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialDrafts.at(-1)?.id ?? null,
  );
  const [result, setResult] = useState<GenerateEmailDraftActionResult | null>(
    null,
  );
  const [regenerationGuidance, setRegenerationGuidance] = useState("");
  const [replyText, setReplyText] = useState("");
  const [showReplyBox, setShowReplyBox] = useState(false);
  /** AI work only (generate / regenerate / reply) — must not gate Open in Outlook. */
  const [aiBusy, startAiTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [sendBusy, setSendBusy] = useState<"connected" | "mark" | null>(null);
  /** Edits not yet confirmed saved to the server. */
  const [dirty, setDirty] = useState(false);
  /**
   * Persist failed after handoff/send, or autosave — never silent when the
   * on-screen body may have left the building without a DB write.
   */
  const [persistFailure, setPersistFailure] = useState<{
    message: string;
    draftId: string;
    subject: string;
    body: string;
    afterHandoff: boolean;
  } | null>(null);
  /** True only after a successful Open in Outlook/Gmail click in this session. */
  const [awaitingSendConfirm, setAwaitingSendConfirm] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState(
    resolvedPersonaId ??
      suggestedPersonaId ??
      personaOptions[0]?.id ??
      "",
  );
  const latest = drafts.at(-1) ?? null;
  const selected =
    drafts.find((draft) => draft.id === selectedId) ?? latest ?? null;
  const [selectedLength, setSelectedLength] = useState<CampaignEmailLength>(
    selected?.emailLength ?? campaignEmailLength,
  );
  const canAdd = Boolean(
    !readOnly &&
      !suppressed &&
      latest?.status === "SENT" &&
      latest.sentAt,
  );
  const canDraftReply = Boolean(
    !readOnly && !suppressed && selected?.status === "SENT",
  );
  const addDisabledReason = latest
    ? `Email ${latest.sequenceNumber} must be marked as sent first.`
    : "Generate Email 1 first.";
  const displayWarnings = useMemo(
    () => result?.offerWarnings ?? offerWarnings,
    [result, offerWarnings],
  );
  /** Blocks editors / AI controls — not Open in Outlook. */
  const editorsLocked = aiBusy || sendBusy !== null;
  const handoffLocked = sendBusy !== null || aiBusy;

  useEffect(() => {
    setSelectedPersonaId(
      resolvedPersonaId ??
        suggestedPersonaId ??
        personaOptions[0]?.id ??
        "",
    );
  }, [
    campaignContactId,
    resolvedPersonaId,
    suggestedPersonaId,
    personaOptions,
  ]);

  // Leaving a draft clears an unanswered prompt — do not re-open from stored handoffAt.
  useEffect(() => {
    setAwaitingSendConfirm(false);
    setDirty(false);
    setPersistFailure(null);
  }, [selected?.id]);

  useEffect(() => {
    if (readOnly || suppressed || !onDraftOpenedForReview) return;
    if (!selected?.id || !selected.subject || !selected.body) return;
    if (selected.status === "SENT") return;
    onDraftOpenedForReview(selected.id);
  }, [
    onDraftOpenedForReview,
    readOnly,
    selected?.body,
    selected?.id,
    selected?.status,
    selected?.subject,
    suppressed,
  ]);

  const clientOpenInFlight = useRef(false);
  const saveSeqRef = useRef(0);

  const showSendConfirm = Boolean(
    !readOnly &&
      selected &&
      selected.status !== "SENT" &&
      awaitingSendConfirm,
  );

  function applyGenerated(next: GenerateEmailDraftActionResult) {
    setResult(next);
    if (next.noDraftNeeded) {
      setReplyText("");
      setShowReplyBox(false);
      router.refresh();
      return;
    }
    if (
      !next.ok ||
      !next.draftId ||
      !next.subject ||
      !next.body ||
      !next.sequenceNumber ||
      !next.kind
    ) {
      return;
    }
    const nextDraft: SequenceDraft = {
      id: next.draftId,
      sequenceNumber: next.sequenceNumber,
      subject: next.subject,
      body: next.body,
      status: next.status ?? "DRAFT",
      kind: next.kind,
      sentAt: null,
      handoffAt: null,
      replyClassification: next.replyClassification ?? null,
      referralSuggested: next.referralSuggested ?? false,
      emailLength: next.emailLength ?? selectedLength,
      personaId: next.personaId ?? (selectedPersonaId || null),
      personalizationTier:
        next.personalizationTier === "BEST" ||
        next.personalizationTier === "COMPANY" ||
        next.personalizationTier === "THIN"
          ? next.personalizationTier
          : null,
      personalizationSources: next.personalizationSources ?? null,
      claimConflicts: next.claimConflicts ?? [],
    };
    if (next.emailLength) setSelectedLength(next.emailLength);
    setDrafts((current) => {
      const exists = current.some((draft) => draft.id === nextDraft.id);
      return exists
        ? current.map((draft) =>
            draft.id === nextDraft.id ? nextDraft : draft,
          )
        : [...current, nextDraft].sort(
            (a, b) => a.sequenceNumber - b.sequenceNumber,
          );
    });
    setSelectedId(nextDraft.id);
    setRegenerationGuidance("");
    setReplyText("");
    setShowReplyBox(false);
    setDirty(false);
    setPersistFailure(null);
    onDraftGenerated?.({
      id: next.draftId,
      subject: next.subject,
      body: next.body,
      sequenceNumber: next.sequenceNumber,
      kind: next.kind,
    });
    router.refresh();
  }

  function run(action: () => Promise<GenerateEmailDraftActionResult>) {
    if (readOnly || suppressed) {
      setResult({
        ok: false,
        message: readOnly
          ? "This campaign is archived and read-only."
          : "This address is on the organization do-not-contact list.",
      });
      return;
    }
    startAiTransition(async () => applyGenerated(await action()));
  }

  function updateSelectedDraft(changes: Partial<SequenceDraft>) {
    if (!selected) return;
    if (
      changes.subject !== undefined ||
      changes.body !== undefined ||
      changes.emailLength !== undefined
    ) {
      setDirty(true);
    }
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === selected.id ? { ...draft, ...changes } : draft,
      ),
    );
  }

  async function persistDraft(
    draft: SequenceDraft,
  ): Promise<GenerateEmailDraftActionResult> {
    const saved = await saveEmailDraftAction({
      emailDraftId: draft.id,
      subject: draft.subject,
      body: draft.body,
      emailLength: selectedLength,
    });
    if (saved.ok && saved.subject && saved.body) {
      setDrafts((current) =>
        current.map((entry) =>
          entry.id === draft.id
            ? {
                ...entry,
                subject: saved.subject!,
                body: saved.body!,
                claimConflicts: saved.claimConflicts ?? entry.claimConflicts,
              }
            : entry,
        ),
      );
    }
    return saved;
  }

  /**
   * Persist without blocking handoff. On failure after handoff/send, surfaces a
   * retry banner — the client already has the on-screen body.
   */
  async function persistInBackground(
    draft: SequenceDraft,
    options?: { afterHandoff?: boolean; explicit?: boolean },
  ): Promise<boolean> {
    const seq = ++saveSeqRef.current;
    setSaving(true);
    try {
      const saved = await persistDraft(draft);
      if (seq !== saveSeqRef.current) return saved.ok;
      if (!saved.ok) {
        const base =
          saved.message ?? "Could not save this draft to the server.";
        setPersistFailure({
          draftId: draft.id,
          subject: draft.subject,
          body: draft.body,
          afterHandoff: Boolean(options?.afterHandoff),
          message: options?.afterHandoff
            ? `Your email client opened with the current on-screen copy, but those edits were not saved here. ${base} Retry save so we keep what you sent.`
            : base,
        });
        if (options?.explicit) setResult(saved);
        return false;
      }
      setDirty(false);
      setPersistFailure((current) =>
        current?.draftId === draft.id ? null : current,
      );
      if (options?.explicit) {
        setResult(saved);
        router.refresh();
      }
      return true;
    } finally {
      if (seq === saveSeqRef.current) setSaving(false);
    }
  }

  function saveDraft() {
    if (!selected || selected.status === "SENT") return;
    void persistInBackground(selected, { explicit: true });
  }

  function retryFailedPersist() {
    if (!persistFailure) return;
    void persistInBackground(
      {
        ...(selected && selected.id === persistFailure.draftId
          ? selected
          : {
              id: persistFailure.draftId,
              subject: persistFailure.subject,
              body: persistFailure.body,
              sequenceNumber: selected?.sequenceNumber ?? 0,
              status: selected?.status ?? "DRAFT",
              kind: selected?.kind ?? "INITIAL",
              sentAt: null,
              handoffAt: null,
              replyClassification: null,
              referralSuggested: false,
              emailLength: selectedLength,
              personaId: selected?.personaId ?? null,
              personalizationTier: null,
              personalizationSources: null,
              claimConflicts: selected?.claimConflicts ?? [],
            }),
        subject: persistFailure.subject,
        body: persistFailure.body,
      },
      {
        explicit: true,
        afterHandoff: persistFailure.afterHandoff,
      },
    );
  }

  // Quiet autosave — explicit Save remains available; handoff does not wait on this.
  useEffect(() => {
    if (
      !dirty ||
      !selected ||
      selected.status === "SENT" ||
      selected.status === "SENDING" ||
      readOnly ||
      suppressed
    ) {
      return;
    }
    const draftSnapshot = selected;
    const timer = window.setTimeout(() => {
      void persistInBackground(draftSnapshot);
    }, 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot intentionally from dirty edits
  }, [dirty, selected?.id, selected?.subject, selected?.body, selectedLength]);

  function openInEmailClient(client: EmailClient) {
    if (!selected || !contactEmail || clientOpenInFlight.current) return;
    // Handoff is composed from the on-screen draft, not a round-trip to the DB.
    const snapshot = {
      id: selected.id,
      subject: selected.subject,
      body: selected.body,
      status: selected.status,
    };
    const launch = buildEmailClientLaunch({
      client,
      to: contactEmail,
      subject: snapshot.subject,
      body: appendEmailSignature(snapshot.body, emailSignature),
      maxUrlLength: emailDeeplinkMaxUrlLength,
    });
    if (!launch.href) {
      setResult({
        ok: false,
        message:
          "The recipient and subject are too long for a safe email-client link. Shorten the subject and try again.",
      });
      return;
    }
    const href = launch.href;
    let copyPromise: Promise<void> | null = null;
    if (launch.bodyToCopy) {
      if (!navigator.clipboard?.writeText) {
        setResult({
          ok: false,
          message:
            "This browser cannot copy the full email body automatically. Copy it from the editor before opening your email client.",
        });
        return;
      }
      copyPromise = navigator.clipboard.writeText(launch.bodyToCopy);
    }

    // https clients (Gmail, Outlook Web) must open under the user gesture.
    // Opening only after await persist/record is often blocked; a blocked popup
    // can fall through to same-tab navigation and tear down the confirm modal
    // before paint. mailto (Outlook desktop) stays same-tab by design.
    const preOpenedTab =
      client === "OUTLOOK_DESKTOP"
        ? null
        : typeof window !== "undefined"
          ? window.open("about:blank", "_blank")
          : null;

    clientOpenInFlight.current = true;

    // Open immediately with the on-screen body — do not await save.
    void (async () => {
      try {
        if (copyPromise) {
          try {
            await copyPromise;
          } catch {
            preOpenedTab?.close();
            setResult({
              ok: false,
              message:
                "The browser could not copy the full email body. Copy it from the editor before opening your email client.",
            });
            return;
          }
        }
        if (preOpenedTab && !preOpenedTab.closed) {
          preOpenedTab.location.href = href;
          preOpenedTab.opener = null;
        } else {
          openEmailClientHref(href);
        }

        if (snapshot.status !== "SENT") {
          // Background persist of the same snapshot used for the handoff.
          void persistInBackground(
            {
              ...selected,
              subject: snapshot.subject,
              body: snapshot.body,
            },
            { afterHandoff: true },
          );
        }

        const recorded = await recordEmailClientIntentAction({
          emailDraftId: snapshot.id,
          client,
          bodyHandling: launch.bodyHandling,
        });
        setResult(recorded);
        if (!recorded.ok) return;
        if (recorded.handoffAt) {
          updateSelectedDraft({ handoffAt: recorded.handoffAt });
          setAwaitingSendConfirm(true);
        }
      } finally {
        clientOpenInFlight.current = false;
      }
    })();
  }

  function answerSendConfirm(answer: "yes" | "no" | "not_yet") {
    if (!selected?.handoffAt) return;
    if (answer === "not_yet") {
      setAwaitingSendConfirm(false);
      return;
    }
    if (answer === "no") {
      sessionStorage.setItem(
        deeplinkSendDeclinedStorageKey(selected.id, selected.handoffAt),
        "1",
      );
      setAwaitingSendConfirm(false);
      setResult({
        ok: true,
        message:
          "Left as unsent. Open the draft again after you send, or mark it sent manually.",
      });
      return;
    }
    setAwaitingSendConfirm(false);
    markSent();
  }

  function markSent() {
    if (!selected) return;
    setSendBusy("mark");
    void (async () => {
      try {
        if (selected.status !== "SENT") {
          // Mark-as-sent must store the on-screen copy before the draft locks.
          const saved = await persistDraft(selected);
          if (!saved.ok) {
            setPersistFailure({
              draftId: selected.id,
              subject: selected.subject,
              body: selected.body,
              afterHandoff: true,
              message: `Could not save your latest edits before marking sent. ${saved.message ?? ""} Retry save, then mark sent again.`,
            });
            setResult(saved);
            return;
          }
          setDirty(false);
          setPersistFailure(null);
        }
        const next = await markEmailDraftSentAction(selected.id);
        setResult(next);
        if (next.ok) {
          const sentAt = new Date().toISOString();
          setDrafts((current) =>
            current.map((draft) =>
              draft.id === selected.id
                ? {
                    ...draft,
                    status: "SENT",
                    sentAt,
                  }
                : draft,
            ),
          );
          onSendComplete?.({ id: selected.id, sentAt });
        }
      } finally {
        setSendBusy(null);
      }
    })();
  }

  function sendConnected() {
    if (!selected || selected.status === "SENT") return;
    // Connected send uses the on-screen subject/body; the server persists them.
    const snapshot = {
      id: selected.id,
      subject: selected.subject,
      body: selected.body,
    };
    setSendBusy("connected");
    void (async () => {
      try {
        const sent = await sendEmailDraftConnectedAction({
          emailDraftId: snapshot.id,
          subject: snapshot.subject,
          body: snapshot.body,
        });
        setResult(sent);
        if (sent.ok && sent.sentAt) {
          setDirty(false);
          setPersistFailure(null);
          setDrafts((current) =>
            current.map((draft) =>
              draft.id === selected.id
                ? { ...draft, status: "SENT", sentAt: sent.sentAt! }
                : draft,
            ),
          );
          onSendComplete?.({ id: selected.id, sentAt: sent.sentAt });
        }
      } finally {
        setSendBusy(null);
      }
    })();
  }

  return (
    <>
      <div className="text-sm">
        <p className="font-medium text-slate-900">{contactName}</p>
        <p className="text-slate-600">{contactDetails}</p>
        <p className="text-slate-500">{contactEmail ?? "No email address"}</p>
        <div className="mt-3">
          <SuppressContactForm
            contactId={contactId}
            email={contactEmail}
            suppressed={suppressed}
          />
        </div>
        {readOnly ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            This campaign is archived and read-only.
          </p>
        ) : null}
        {suppressed ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            This address is opted out organization-wide. Restore it before
            generating or sending email.
          </p>
        ) : null}
        <dl className="mt-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Contact status
          </dt>
          <dd className="mt-1 text-sm text-slate-900">{contactStatus}</dd>
        </dl>

        <div className="mt-5 border-t border-slate-200 pt-4">
          {drafts.some((draft) => draft.status === "SENT") ? (
            <p
              className="mb-3 flex gap-2 rounded-md border border-slate-400 bg-slate-200 px-3 py-2 text-xs text-slate-800"
              data-testid="sequence-reply-guidance"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                When this prospect replies, click the email they replied to,
                choose Draft reply, and paste what they wrote — we will draft a
                response you can send.
              </span>
            </p>
          ) : null}
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Sequence
          </p>
          <div className="mt-2 space-y-2">
            {drafts.map((draft) => {
              const isSelected = draft.id === selected?.id;
              const isCurrent = draft.id === latest?.id;
              const activity = sequenceActivity(draft);
              return (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(draft.id);
                    setShowReplyBox(false);
                    setResult(null);
                    if (draft.emailLength) setSelectedLength(draft.emailLength);
                  }}
                  className={`group flex w-full cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-left text-xs transition ${
                    isSelected
                      ? "border-slate-900 bg-slate-100 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 hover:shadow-sm"
                  }`}
                >
                  <span>
                    <span className="font-medium">
                      Email {draft.sequenceNumber}
                    </span>{" "}
                    <span
                      className={
                        draft.status === "SENT"
                          ? "text-emerald-700"
                          : "text-amber-700"
                      }
                    >
                      {draft.status}
                    </span>
                    {draft.claimConflicts.length > 0 ? " · claims" : ""}
                    {activity ? ` · ${activity}` : ""}
                  </span>
                  <span
                    className={
                      isSelected
                        ? "font-medium text-slate-700"
                        : "font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 group-hover:decoration-slate-600"
                    }
                  >
                    {isSelected
                      ? draft.status === "SENT"
                        ? "Open"
                        : "Editing"
                      : "Open"}
                    {isCurrent ? " · current" : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={!canAdd || aiBusy}
            title={canAdd ? "Generate the next email." : addDisabledReason}
            onClick={() =>
              run(() =>
                addFollowUpEmailAction(
                  campaignContactId,
                  selectedPersonaId || null,
                  selectedLength,
                ),
              )
            }
            className={cn(SECONDARY_BUTTON_CLASS, "mt-3", "disabled:border-slate-200", "disabled:bg-slate-50", "disabled:text-slate-400", "!px-3")}
          >
            + Add email to sequence
          </button>
          {!canAdd ? (
            <p className="mt-1 text-xs text-slate-500">{addDisabledReason}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        {displayWarnings.length > 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">
              Offer validation notes
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-900">
              {displayWarnings.map((warning) => (
                <li key={`${warning.code}-${warning.message}`}>
                  {warning.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {selected?.staleReasons && selected.staleReasons.length > 0 ? (
          <div
            className="rounded-md border border-amber-300 bg-amber-50 p-3"
            data-testid="email-draft-stale-marker"
          >
            <p className="text-sm text-amber-950">
              {formatDraftStalenessMessage(selected.staleReasons)}
            </p>
          </div>
        ) : null}

        {result ? (
          <div role="status" data-testid="email-sequence-status">
            <p
              className={
                !result.ok
                  ? "text-sm text-red-600"
                  : result.claimConflicts && result.claimConflicts.length > 0
                    ? "text-sm text-amber-800"
                    : "text-sm text-emerald-700"
              }
            >
              {result.message}
            </p>
            {result.claimConflicts && result.claimConflicts.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
                {(result.claimConflicts ?? []).map((conflict, index) => (
                  <li key={`${conflict.type}-${index}`}>
                    {conflict.description}
                    {conflict.bodyExcerpt
                      ? ` — “${conflict.bodyExcerpt}”`
                      : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {result.referralSuggested ? (
              <p className="mt-1 text-xs font-medium text-amber-700">
                Referral detected. A new contact may need to be added; no
                contact was created automatically.
              </p>
            ) : null}
            {result.recoveryAction === "RECONNECT" ||
            result.recoveryAction === "ASK_ADMIN" ? (
              <a
                href="/settings/email"
                className="mt-2 inline-block text-sm font-medium text-slate-900 underline"
              >
                Open email connection settings
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div data-testid="personalization-tier">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Personalization inputs
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {personalizationLabel}
            </p>
            <p className="mt-1 text-xs text-slate-700">
              {selected?.personalizationSources ?? personalizationSources}
            </p>
            <p className="mt-1 text-xs text-slate-500">{personalizationDetail}</p>
          </div>
          <fieldset data-testid="email-length">
            <legend className="text-sm font-medium text-slate-700">
              Length for this email
            </legend>
            <p className="mt-1 text-xs text-slate-500">
              Campaign default is {emailLengthLabel(campaignEmailLength)}.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              {EMAIL_LENGTH_OPTIONS.map((value) => (
                <label
                  key={value}
                  className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <input
                    type="radio"
                    name={`emailLength-${campaignContactId}`}
                    value={value}
                    checked={selectedLength === value}
                    disabled={editorsLocked || selected?.status === "SENT"}
                    onChange={() => {
                      setSelectedLength(value);
                      updateSelectedDraft({ emailLength: value });
                    }}
                  />
                  {emailLengthLabel(value)}
                </label>
              ))}
            </div>
          </fieldset>
          <div data-testid="resolved-persona">
            {needsPersonaConfirmation ? (
              <div
                className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                data-testid="persona-confirmation-prompt"
              >
                <p className="font-medium">This contact needs a persona</p>
                <p className="mt-1 text-xs text-amber-900">
                  {personaDecisionReason ??
                    "No persona was matched during scoring."}
                  {suggestedPersonaName
                    ? ` Campaign default: ${suggestedPersonaName}.`
                    : ""}
                </p>
              </div>
            ) : null}
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Persona for this email</span>
              {resolvedPersonaName && !needsPersonaConfirmation ? (
                <span className="mt-1 block text-xs text-slate-500">
                  {hasPersonaDecision && resolvedPersonaId
                    ? `Resolved persona: ${resolvedPersonaName}. Change before generating if needed.`
                    : null}
                </span>
              ) : needsPersonaConfirmation ? (
                <span className="mt-1 block text-xs text-slate-500">
                  Confirm which persona applies before generating.
                </span>
              ) : null}
              <select
                value={selectedPersonaId}
                onChange={(event) => setSelectedPersonaId(event.target.value)}
                disabled={editorsLocked || personaOptions.length === 0}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {personaOptions.length === 0 ? (
                  <option value="">No personas available</option>
                ) : null}
                {personaOptions.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {persona.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {!selected ? (
          <button
            type="button"
            disabled={aiBusy || !selectedPersonaId}
            onClick={() =>
              run(() =>
                generateEmailDraftAction(
                  campaignContactId,
                  undefined,
                  selectedPersonaId || null,
                  selectedLength,
                ),
              )
            }
            className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
          >
            {aiBusy
              ? "Generating…"
              : needsPersonaConfirmation
                ? "Confirm persona & generate Email 1"
                : "Generate Email 1"}
          </button>
        ) : (
          <>
            {selected.id !== latest?.id ? (
              <button
                type="button"
                onClick={() => setSelectedId(latest?.id ?? null)}
                className="text-sm font-medium text-slate-700 underline"
              >
                Return to current draft
              </button>
            ) : null}

            <article
              className={`rounded-md border p-4 ${
                selected.status === "SENT"
                  ? "border-slate-200 bg-slate-50"
                  : "border-slate-400 bg-white shadow-sm"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Email {selected.sequenceNumber} · {selected.kind}
                </p>
                <span className="text-xs font-medium text-slate-600">
                  {selected.status}
                </span>
              </div>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Subject
              </p>
              {selected.status === "SENT" || selected.status === "SENDING" ? (
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {selected.subject}
                </p>
              ) : (
                <input
                  type="text"
                  value={selected.subject}
                  onChange={(event) =>
                    updateSelectedDraft({ subject: event.target.value })
                  }
                  maxLength={EMAIL_SUBJECT_MAX_CHARS}
                  disabled={editorsLocked}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900"
                />
              )}
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Body
              </p>
              {selected.status === "SENT" || selected.status === "SENDING" ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                  {selected.body}
                </p>
              ) : (
                <textarea
                  value={selected.body}
                  onChange={(event) =>
                    updateSelectedDraft({ body: event.target.value })
                  }
                  rows={10}
                  maxLength={EMAIL_BODY_MAX_CHARS}
                  disabled={editorsLocked}
                  className="mt-1 w-full whitespace-pre-wrap rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800"
                />
              )}
              {selected.claimConflicts.length > 0 ? (
                <div className="mt-4 space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-950">
                    Claim conflicts in this draft
                  </p>
                  <p className="text-xs text-amber-900">
                    Model-invented claims were flagged. Sending is still
                    allowed — review the copy if you want to edit it.
                  </p>
                  <ul className="space-y-2 text-sm text-amber-950">
                    {selected.claimConflicts.map((conflict, index) => (
                      <li
                        key={`${conflict.type}-${conflict.description}-${index}`}
                        className="rounded border border-amber-200 bg-white/70 px-3 py-2"
                      >
                        <p className="font-medium">
                          {conflict.type.replaceAll("_", " ")}
                        </p>
                        <p className="mt-1">{conflict.description}</p>
                        {conflict.bodyExcerpt ? (
                          <p className="mt-1 text-xs text-amber-900">
                            Offending copy: “{conflict.bodyExcerpt}”
                          </p>
                        ) : null}
                        {conflict.matchedGuard ? (
                          <p className="mt-1 text-xs text-amber-900">
                            Product restriction: {conflict.matchedGuard}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>

            {selected.status === "SENDING" ? (
              <p className="text-sm text-slate-600">
                Microsoft send is in progress. This draft is temporarily
                read-only.
              </p>
            ) : selected.status !== "SENT" ? (
              <div className="space-y-3">
                <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">
                        What should change?
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Applies only when you regenerate this draft.
                      </span>
                      <input
                        type="text"
                        value={regenerationGuidance}
                        onChange={(event) =>
                          setRegenerationGuidance(event.target.value)
                        }
                        maxLength={ADDITIONAL_GUIDANCE_MAX_CHARS}
                        disabled={aiBusy}
                        placeholder="Use a more direct tone and ask for a reply"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <EmailGuidancePromptExamples />
                  </div>
                  <button
                    type="button"
                    disabled={aiBusy || !selectedPersonaId}
                    onClick={() =>
                      run(() =>
                        regenerateEmailDraftAction(
                          selected.id,
                          regenerationGuidance,
                          selectedPersonaId || null,
                          selectedLength,
                        ),
                      )
                    }
                    className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
                  >
                    {aiBusy ? "Regenerating…" : "Regenerate"}
                  </button>
                </div>
                {persistFailure ? (
                  <div
                    className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950"
                    data-testid="draft-persist-failure"
                  >
                    <p className="font-medium">
                      {persistFailure.afterHandoff
                        ? "Edits were used for send, but not saved"
                        : "Draft could not be saved"}
                    </p>
                    <p>{persistFailure.message}</p>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={retryFailedPersist}
                      className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-950"
                    >
                      {saving ? "Saving…" : "Retry save"}
                    </button>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={saving || sendBusy !== null}
                    onClick={saveDraft}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
                  >
                    {saving ? "Saving…" : "Save draft"}
                  </button>
                  {saving ? (
                    <span className="text-xs text-slate-500">Saving…</span>
                  ) : dirty ? (
                    <span className="text-xs text-slate-500">Unsaved edits</span>
                  ) : null}
                  {EMAIL_CLIENT_OPTIONS.map((option) => (
                    <button
                      key={option.client}
                      type="button"
                      disabled={handoffLocked || !contactEmail}
                      title={
                        contactEmail
                          ? `Open in ${option.label} with the current on-screen copy.`
                          : "Add an email address to this contact first."
                      }
                      onClick={() => openInEmailClient(option.client)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      Open in {option.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={
                      handoffLocked ||
                      mailboxConnection?.status !== "CONNECTED"
                    }
                    title={
                      mailboxConnection?.status === "CONNECTED"
                        ? `Send from ${mailboxConnection.mailboxAddress}.`
                        : "Connect Microsoft 365 in Email connection settings first."
                    }
                    onClick={sendConnected}
                    className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {sendBusy === "connected"
                      ? "Sending…"
                      : "Send with Microsoft 365"}
                  </button>
                  <button
                    type="button"
                    disabled={handoffLocked}
                    onClick={markSent}
                    className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
                  >
                    {sendBusy === "mark"
                      ? "Marking…"
                      : "I sent this — mark as sent"}
                  </button>
                </div>
                {mailboxConnection?.status !== "CONNECTED" ? (
                  <a
                    href="/settings/email"
                    className="text-xs font-medium text-slate-700 underline"
                  >
                    {mailboxConnection?.status === "RECONNECT_REQUIRED"
                      ? "Reconnect Microsoft 365 to send directly"
                      : "Connect Microsoft 365 to send directly"}
                  </a>
                ) : null}
                {!emailSignature ? (
                  <a
                    href="/settings/email"
                    className="text-xs font-medium text-slate-700 underline"
                  >
                    Add a signature — it is appended on send and when you open
                    Outlook or Gmail
                  </a>
                ) : null}
                {dailySendUsage.used >= dailySendUsage.warningLimit ? (
                  <p className="text-xs font-medium text-amber-700">
                    {formatDailySendAdvisory(dailySendUsage.used)}
                  </p>
                ) : null}
                <p className="text-xs text-slate-500">
                  Mark as sent records your assertion that you sent the email.
                  It is not a delivery confirmation. Connected Microsoft 365
                  send is confirmed automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  Sent emails are read-only.
                </p>
                <div className="flex flex-wrap gap-2">
                  {EMAIL_CLIENT_OPTIONS.map((option) => (
                    <button
                      key={option.client}
                      type="button"
                      disabled={!contactEmail}
                      title={
                        contactEmail
                          ? `Open this sent email in ${option.label}.`
                          : "Add an email address to this contact first."
                      }
                      onClick={() => openInEmailClient(option.client)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      Open in {option.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={!canDraftReply || aiBusy}
                    title={
                      canDraftReply
                        ? "Paste the prospect reply."
                        : "Open a sent email in this sequence to draft a reply."
                    }
                    onClick={() => setShowReplyBox((value) => !value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    Draft reply
                  </button>
                  <button
                    type="button"
                    disabled={!canAdd || aiBusy}
                    title={
                      canAdd ? "Generate the next email." : addDisabledReason
                    }
                    onClick={() =>
                      run(() =>
                        addFollowUpEmailAction(
                          campaignContactId,
                          selectedPersonaId || null,
                          selectedLength,
                        ),
                      )
                    }
                    className={cn(
                      SECONDARY_BUTTON_CLASS,
                      "disabled:border-slate-200",
                      "disabled:bg-slate-50",
                      "disabled:text-slate-400",
                      "!px-3",
                    )}
                  >
                    + Add email to sequence
                  </button>
                  {!sequenceStopped ? (
                    <button
                      type="button"
                      disabled={aiBusy}
                      onClick={() =>
                        startAiTransition(async () => {
                          const res = await stopSequenceAction(campaignContactId);
                          setResult(res);
                          router.refresh();
                        })
                      }
                      className="rounded-md border border-rose-200 px-3 py-2 text-sm font-medium text-rose-800"
                    >
                      Stop sequence
                    </button>
                  ) : sequenceStoppedReason === "MANUAL_STOP" ||
                    sequenceStoppedReason === "MAX_SEQUENCE" ? (
                    <button
                      type="button"
                      disabled={aiBusy}
                      onClick={() =>
                        startAiTransition(async () => {
                          const res =
                            await restoreSequenceAction(campaignContactId);
                          setResult(res);
                          router.refresh();
                        })
                      }
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
                    >
                      Restore sequence
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {showReplyBox && selected.status === "SENT" ? (
              <div className="space-y-2 rounded-md border border-slate-200 p-3">
                <p className="text-xs text-slate-600">
                  They replied — cadence stops when you submit. Reply drafts are
                  copy-only; this app does not send replies from your mailbox.
                </p>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">
                    Paste what the prospect wrote
                  </span>
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    maxLength={PROSPECT_REPLY_MAX_CHARS}
                    rows={5}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={aiBusy || !replyText.trim()}
                  onClick={() =>
                    run(() => draftReplyAction(selected.id, replyText))
                  }
                  className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
                >
                  {aiBusy ? "Classifying…" : "They replied"}
                </button>
              </div>
            ) : null}

            {selected.kind === "REPLY" && selected.status !== "SENT" ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                Copy this reply into your inbox and send it yourself. This app
                does not send reply emails. Opening in Outlook or Gmail still
                appends your saved signature.
              </p>
            ) : null}
          </>
        )}
      </div>

      {showSendConfirm ? (
        <div
          data-testid="deeplink-send-confirm"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deeplink-send-confirm-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-lg">
            <p
              id="deeplink-send-confirm-title"
              className="text-center text-base font-semibold text-slate-900"
            >
              Did you send this email?
            </p>
            <p className="mt-2 text-center text-sm text-slate-600">
              We ask so follow-ups are timed correctly and so you don&apos;t
              email the same person twice.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                disabled={sendBusy !== null}
                onClick={() => answerSendConfirm("yes")}
                className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
              >
                Yes
              </button>
              <button
                type="button"
                disabled={sendBusy !== null}
                onClick={() => answerSendConfirm("no")}
                className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
              >
                No
              </button>
              <button
                type="button"
                disabled={sendBusy !== null}
                onClick={() => answerSendConfirm("not_yet")}
                className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
              >
                Not yet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
