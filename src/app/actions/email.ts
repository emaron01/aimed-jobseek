"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  requireCurrentUser,
  requireVerifiedForAiSpend,
} from "@/lib/auth/authz";
import {
  loadEmailGenerationContext,
  loadExistingEmailDraftContext,
  loadEmailReplyContext,
} from "@/lib/email-generation/context";
import {
  additionalGuidanceRejection,
} from "@/lib/email-generation/prompt";
import {
  buildFollowUpEmailPrompt,
  buildReplyEmailPrompt,
  prepareEmailGenerationMessages,
  type PreparedEmailGeneration,
} from "@/lib/email-generation/prepare-email-generation";
import {
  generateEmailDraft,
  toSafeEmailGenerationError,
} from "@/lib/email-generation/service";
import {
  markEmailDraftSent,
  nextSequencePosition,
  recordEmailClientIntent,
  updateEmailDraftContent,
} from "@/lib/email-generation/sequence";
import {
  classifyProspectReply,
  PROSPECT_REPLY_MAX_CHARS,
} from "@/lib/email-generation/reply";
import { isMeetingSchedulingReply } from "@/lib/cadence/engine";
import { stopSequenceForContact } from "@/lib/cadence/stop-sequence";
import type { OfferConflict } from "@/lib/campaign/offer-validation";
import { unacknowledgedOfferWarnings } from "@/lib/email-generation/offer-warnings";
import {
  EMAIL_CLIENTS,
  type EmailClient,
  type EmailClientBodyHandling,
} from "@/lib/email-generation/email-body";
import { sendEmailDraftWithConnectedMailbox } from "@/lib/mailbox/send";
import { MailboxConnectionError } from "@/lib/mailbox/microsoft-oauth";
import { parseEmailLength } from "@/lib/campaign/save";
import type { EmailLength } from "@prisma/client";
import { formatDailySendAdvisory } from "@/lib/usage/send-advisory";
import { isLookaheadEligible } from "@/lib/campaign/email-draft-lookahead";
import { commitLookaheadDraftQuota } from "@/lib/email-generation/lookahead-quota";
import { resolveEmailGenerationPersona } from "@/lib/email-generation/personalization";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";
import { assertGatedAction } from "@/lib/product-config/feature-access";

export type GenerateEmailDraftActionResult = {
  ok: boolean;
  message: string;
  draftId?: string;
  subject?: string;
  body?: string;
  sequenceNumber?: number;
  kind?: "INITIAL" | "FOLLOW_UP" | "REPLY";
  status?: "DRAFT" | "SENT";
  replyClassification?:
    "INTERESTED" | "OBJECTION" | "REFERRAL" | "NOT_NOW" | "NOT_INTERESTED";
  referralSuggested?: boolean;
  offerWarnings?: OfferConflict[];
  claimConflicts?: import("@/lib/email-generation/claim-validation-contract").ClaimValidationViolation[];
  sentAt?: string;
  handoffAt?: string;
  sendUsage?: {
    used: number;
    warningLimit: number;
    limit: number;
    warning: boolean;
  };
  emailLength?: EmailLength;
  personaId?: string;
  personalizationTier?: string;
  personalizationSources?: string;
  recoveryAction?:
    | "RECONNECT"
    | "ASK_ADMIN"
    | "EDIT_DRAFT"
    | "RETRY"
    | "WAIT_RETRY"
    | "CONTACT_SUPPORT";
  noDraftNeeded?: boolean;
};

function revalidateCampaign(campaignId: string): void {
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
}

async function persistChosenPersonaForGeneration(
  campaignContactId: string,
  organizationId: string,
  userId: string,
  personaId: string,
): Promise<void> {
  const row = await prisma.campaignContact.findFirst({
    where: { id: campaignContactId, organizationId },
    select: {
      chosenPersonaId: true,
      campaign: { select: { productId: true, ownerUserId: true } },
    },
  });
  if (!row) {
    throw new TenantError(
      `${vocab.campaign.Singular} ${vocab.contact.singular} was not found in the active organization.`,
    );
  }
  if (row.campaign.ownerUserId !== userId) {
    throw new TenantError(
      `This ${vocab.campaign.singular} is read-only because it belongs to another user.`,
    );
  }
  if (row.chosenPersonaId === personaId) return;

  const persona = await prisma.persona.findFirst({
    where: {
      id: personaId,
      organizationId,
      productId: row.campaign.productId,
    },
    select: { id: true },
  });
  if (!persona) {
    throw new TenantError(
      `The selected ${vocab.persona.singular} is not available for this ${vocab.campaign.singular}.`,
    );
  }

  await prisma.campaignContact.update({
    where: { id: campaignContactId },
    data: { chosenPersonaId: personaId },
  });
}

function generationOptionsFromPrepared(
  prepared: PreparedEmailGeneration,
  extra: Parameters<typeof generateEmailDraft>[2] = {},
) {
  return {
    ...extra,
    requiredMotionSpecifics: prepared.requiredMotionSpecifics,
    personalization: prepared.personalization,
    factSelectionUsage: prepared.factSelection.usage,
    factSelectionCacheKey: prepared.factSelection.cacheKey,
  };
}

export async function generateEmailDraftAction(
  campaignContactId: string,
  additionalGuidance?: string,
  personaId?: string | null,
  emailLength?: string | null,
): Promise<GenerateEmailDraftActionResult> {
  const rejected = additionalGuidanceRejection(additionalGuidance);
  if (rejected) return rejected;
  const normalizedGuidance = additionalGuidance?.trim() || null;

  try {
    assertGatedAction("legacyEmailSequence");
    const user = await requireVerifiedForAiSpend();
    const normalizedPersonaId = personaId?.trim() || null;
    if (normalizedPersonaId) {
      const organizationId = await requireOrganizationId();
      await persistChosenPersonaForGeneration(
        campaignContactId,
        organizationId,
        user.id,
        normalizedPersonaId,
      );
    }
    const context = await loadEmailGenerationContext(
      campaignContactId,
      user.id,
      {
        personaId: normalizedPersonaId,
        emailLength: parseEmailLength(emailLength),
      },
    );
    const prepared = await prepareEmailGenerationMessages(
      context,
      normalizedGuidance,
    );
    const draft = await generateEmailDraft(
      context,
      prepared.messages,
      generationOptionsFromPrepared(prepared, {
        regenerationGuidance: normalizedGuidance,
      }),
    );

    revalidateCampaign(context.campaign.id);
    const hasClaimConflicts = draft.claimConflicts.length > 0;
    return {
      ok: true,
      message: hasClaimConflicts
        ? "Draft generated with claim conflicts. Review the flagged copy before sending."
        : draft.regenerated
          ? "Email draft regenerated."
          : "Email draft generated.",
      draftId: draft.draftId,
      subject: draft.subject,
      body: draft.body,
      sequenceNumber: draft.sequenceNumber,
      kind: draft.kind,
      status: "DRAFT",
      offerWarnings: unacknowledgedOfferWarnings(context),
      claimConflicts: draft.claimConflicts,
      emailLength: draft.emailLength,
      personaId: draft.personaId,
      personalizationTier: draft.personalizationTier,
      personalizationSources: draft.personalizationSources,
    };
  } catch (error) {
    console.error("Email draft generation failed.", error);
    return {
      ok: false,
      message: toSafeEmailGenerationError(error),
    };
  }
}

export type LookaheadGenerateEmailDraftResult = {
  ok: boolean;
  skipped?: boolean;
  campaignContactId: string;
  draftId?: string;
  subject?: string;
  body?: string;
  sequenceNumber?: number;
  kind?: "INITIAL" | "FOLLOW_UP" | "REPLY";
  status?: "DRAFT";
  source?: "AI_LOOKAHEAD" | "AI";
  generationQuotaCommitted?: boolean;
  personaId?: string;
  personalizationTier?: string;
  personalizationSources?: string;
  claimConflicts?: import("@/lib/email-generation/claim-validation-contract").ClaimValidationViolation[];
};

export async function lookaheadGenerateEmailDraftAction(
  campaignContactId: string,
): Promise<LookaheadGenerateEmailDraftResult> {
  try {
    assertGatedAction("legacyEmailSequence");
    const user = await requireVerifiedForAiSpend();
    const row = await prisma.campaignContact.findFirst({
      where: { id: campaignContactId },
      select: {
        id: true,
        status: true,
        chosenPersonaId: true,
        sequenceStoppedAt: true,
        contact: { select: { id: true, email: true, organizationId: true } },
        campaign: {
          select: {
            personaId: true,
            productId: true,
            icpId: true,
            organizationId: true,
          },
        },
        emailDrafts: {
          select: {
            sequenceNumber: true,
            subject: true,
            body: true,
            status: true,
            personaId: true,
          },
          orderBy: { sequenceNumber: "asc" },
        },
      },
    });
    if (!row) {
      return { ok: false, campaignContactId };
    }
    const latestDraftPersonaId =
      [...row.emailDrafts]
        .reverse()
        .find((draft) => draft.personaId)?.personaId ?? null;
    const matchedScore = await prisma.contactScore.findFirst({
      where: {
        organizationId: row.contact.organizationId,
        contactId: row.contact.id,
        scoringStatus: "COMPLETED",
        scoringRun: {
          organizationId: row.campaign.organizationId,
          productId: row.campaign.productId,
          icpId: row.campaign.icpId,
          status: { in: ["COMPLETED", "PARTIAL"] },
        },
      },
      orderBy: [{ scoredAt: "desc" }, { createdAt: "desc" }],
      select: { matchedPersonaId: true, assessmentData: true },
    });
    const assessmentData = matchedScore?.assessmentData as
      | { aiSkipReason?: string }
      | null
      | undefined;
    const personaDecision = resolveEmailGenerationPersona({
      chosenPersonaId: row.chosenPersonaId,
      storedPersonaId: latestDraftPersonaId,
      matchedPersonaId: matchedScore?.matchedPersonaId ?? null,
      suggestedPersonaId: row.campaign.personaId,
      aiSkipReason: assessmentData?.aiSkipReason ?? null,
    });
    const { contactMatchesSuppressionSet, listActiveNormalizedEmails } =
      await import("@/lib/suppression/service");
    const suppressedEmails = await listActiveNormalizedEmails(
      row.contact.organizationId,
      [row.contact.email],
    );
    const suppressed = contactMatchesSuppressionSet(
      row.contact.email,
      suppressedEmails,
    );
    if (
      !isLookaheadEligible({
        campaignContactId: row.id,
        contactStatus: row.status,
        suppressed,
        sequenceStopped: row.sequenceStoppedAt != null,
        hasPersonaDecision: personaDecision.hasDecision,
        drafts: row.emailDrafts.map((draft) => ({
          sequenceNumber: draft.sequenceNumber,
          subject: draft.subject ?? "",
          body: draft.body ?? "",
          status: draft.status,
        })),
      })
    ) {
      return { ok: false, skipped: true, campaignContactId };
    }

    const context = await loadEmailGenerationContext(
      campaignContactId,
      user.id,
    );
    const prepared = await prepareEmailGenerationMessages(context);
    const draft = await generateEmailDraft(
      context,
      prepared.messages,
      generationOptionsFromPrepared(prepared, {
        onlyIfMissing: true,
        lookahead: true,
        chargeGenerationQuota: false,
        acquireContactResearchIfMissing: false,
      }),
    );
    if (draft.skipped) {
      return { ok: true, skipped: true, campaignContactId };
    }
    return {
      ok: true,
      campaignContactId,
      draftId: draft.draftId,
      subject: draft.subject,
      body: draft.body,
      sequenceNumber: draft.sequenceNumber,
      kind: draft.kind,
      status: "DRAFT",
      source: "AI_LOOKAHEAD",
      generationQuotaCommitted: false,
      personaId: draft.personaId,
      personalizationTier: draft.personalizationTier,
      personalizationSources: draft.personalizationSources,
      claimConflicts: draft.claimConflicts,
    };
  } catch (error) {
    console.error("Lookahead email draft generation failed.", {
      campaignContactId,
      error,
    });
    return { ok: false, campaignContactId };
  }
}

export async function commitLookaheadDraftQuotaAction(
  emailDraftId: string,
): Promise<{ ok: boolean; committed?: boolean; message?: string }> {
  try {
    assertGatedAction("legacyEmailSequence");
    const user = await requireVerifiedForAiSpend();
    const result = await commitLookaheadDraftQuota({
      emailDraftId,
      userId: user.id,
    });
    return { ok: true, committed: result.committed };
  } catch (error) {
    console.error("Lookahead quota commit failed.", { emailDraftId, error });
    return {
      ok: false,
      message: toSafeEmailGenerationError(error),
    };
  }
}

export async function regenerateEmailDraftAction(
  emailDraftId: string,
  additionalGuidance?: string,
  personaId?: string | null,
  emailLength?: string | null,
): Promise<GenerateEmailDraftActionResult> {
  const rejected = additionalGuidanceRejection(additionalGuidance);
  if (rejected) return rejected;
  const normalizedGuidance = additionalGuidance?.trim() || null;

  try {
    assertGatedAction("legacyEmailSequence");
    const user = await requireVerifiedForAiSpend();
    const { context, draft: existing } = await loadExistingEmailDraftContext(
      emailDraftId,
      user.id,
      { personaId, emailLength: parseEmailLength(emailLength) },
    );
    let prepared: PreparedEmailGeneration;
    if (existing.kind === "INITIAL") {
      const initial = await prepareEmailGenerationMessages(
        context,
        normalizedGuidance,
      );
      prepared = {
        messages: initial.messages,
        requiredMotionSpecifics: initial.requiredMotionSpecifics,
        personalization: initial.personalization,
        factSelection: initial.factSelection,
      };
    } else if (existing.kind === "FOLLOW_UP") {
      prepared = await buildFollowUpEmailPrompt(
        context,
        existing.sequenceNumber,
        normalizedGuidance,
      );
    } else {
      const source = context.sequence.find(
        (draft) => draft.id === existing.inReplyToDraftId,
      );
      if (
        !source?.subject ||
        !source.body ||
        !existing.prospectReplyText ||
        !existing.replyClassification
      ) {
        return {
          ok: false,
          message: "This reply draft is missing its thread context.",
        };
      }
      prepared = await buildReplyEmailPrompt({
        context,
        sourceDraft: {
          sequenceNumber: source.sequenceNumber,
          subject: source.subject,
          body: source.body,
        },
        prospectReply: existing.prospectReplyText,
        classification: existing.replyClassification,
        additionalGuidance: normalizedGuidance,
      });
    }
    const regenerated = await generateEmailDraft(
      context,
      prepared.messages,
      generationOptionsFromPrepared(prepared, {
      sequenceNumber: existing.sequenceNumber,
      kind: existing.kind,
      replyClassification: existing.replyClassification,
      prospectReplyText: existing.prospectReplyText,
      referralSuggested: existing.referralSuggested,
      inReplyToDraftId: existing.inReplyToDraftId,
      regenerationGuidance: normalizedGuidance,
      }),
    );
    revalidateCampaign(context.campaign.id);
    const hasClaimConflicts = regenerated.claimConflicts.length > 0;
    return {
      ok: true,
      message: hasClaimConflicts
        ? `Email ${existing.sequenceNumber} regenerated with claim conflicts. Review before sending.`
        : `Email ${existing.sequenceNumber} regenerated.`,
      draftId: regenerated.draftId,
      subject: regenerated.subject,
      body: regenerated.body,
      sequenceNumber: regenerated.sequenceNumber,
      kind: regenerated.kind,
      status: "DRAFT",
      replyClassification: regenerated.replyClassification ?? undefined,
      referralSuggested: regenerated.referralSuggested,
      offerWarnings: unacknowledgedOfferWarnings(context),
      claimConflicts: regenerated.claimConflicts,
      emailLength: regenerated.emailLength,
      personaId: regenerated.personaId,
      personalizationTier: regenerated.personalizationTier,
      personalizationSources: regenerated.personalizationSources,
    };
  } catch (error) {
    console.error("Email draft regeneration failed.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}

export async function addFollowUpEmailAction(
  campaignContactId: string,
  personaId?: string | null,
  emailLength?: string | null,
): Promise<GenerateEmailDraftActionResult> {
  try {
    assertGatedAction("legacyEmailSequence");
    const user = await requireVerifiedForAiSpend();
    const context = await loadEmailGenerationContext(
      campaignContactId,
      user.id,
      { personaId, emailLength: parseEmailLength(emailLength) },
    );
    const sequenceNumber = nextSequencePosition(context);
    const prepared = await buildFollowUpEmailPrompt(context, sequenceNumber);
    const draft = await generateEmailDraft(
      context,
      prepared.messages,
      generationOptionsFromPrepared(prepared, {
        sequenceNumber,
        kind: "FOLLOW_UP",
      }),
    );
    revalidateCampaign(context.campaign.id);
    const hasClaimConflicts = draft.claimConflicts.length > 0;
    return {
      ok: true,
      message: hasClaimConflicts
        ? `Email ${sequenceNumber} added with claim conflicts. Review before sending.`
        : `Email ${sequenceNumber} added to the ${vocab.sequence.singular}.`,
      draftId: draft.draftId,
      subject: draft.subject,
      body: draft.body,
      sequenceNumber,
      kind: "FOLLOW_UP",
      status: "DRAFT",
      offerWarnings: unacknowledgedOfferWarnings(context),
      claimConflicts: draft.claimConflicts,
      emailLength: draft.emailLength,
      personaId: draft.personaId,
      personalizationTier: draft.personalizationTier,
      personalizationSources: draft.personalizationSources,
    };
  } catch (error) {
    console.error("Follow-up email generation failed.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}

export async function markEmailDraftSentAction(
  emailDraftId: string,
): Promise<GenerateEmailDraftActionResult> {
  try {
    assertGatedAction("legacyEmailSequence");
    const user = await requireCurrentUser();
    const marked = await markEmailDraftSent({
      draftId: emailDraftId,
      userId: user.id,
    });
    revalidateCampaign(marked.campaignId);
    return {
      ok: true,
      message: marked.sendUsage?.warning
        ? `Marked as sent. ${formatDailySendAdvisory(marked.sendUsage.used)}`
        : "Marked as sent based on your confirmation. This is not a delivery confirmation.",
      draftId: emailDraftId,
      sequenceNumber: marked.sequenceNumber,
      status: "SENT",
      sendUsage: marked.sendUsage,
    };
  } catch (error) {
    console.error("Failed to mark email draft as sent.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}

export async function saveEmailDraftAction(input: {
  emailDraftId: string;
  subject: string;
  body: string;
  emailLength?: string | null;
}): Promise<GenerateEmailDraftActionResult> {
  try {
    assertGatedAction("legacyEmailSequence");
    const user = await requireCurrentUser();
    const saved = await updateEmailDraftContent({
      draftId: input.emailDraftId,
      userId: user.id,
      subject: input.subject,
      body: input.body,
      emailLength: parseEmailLength(input.emailLength),
    });
    revalidateCampaign(saved.campaignId);
    return {
      ok: true,
      message:
        saved.claimConflicts.length > 0
          ? "Draft saved. Model-invented claims were re-checked and flagged."
          : "Draft saved.",
      draftId: input.emailDraftId,
      subject: saved.subject,
      body: saved.body,
      sequenceNumber: saved.sequenceNumber,
      status: "DRAFT",
      emailLength: saved.emailLength ?? undefined,
      claimConflicts: saved.claimConflicts,
    };
  } catch (error) {
    console.error("Failed to save email draft.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}

export async function recordEmailClientIntentAction(input: {
  emailDraftId: string;
  client: EmailClient;
  bodyHandling: EmailClientBodyHandling;
}): Promise<GenerateEmailDraftActionResult> {
  if (!EMAIL_CLIENTS.includes(input.client)) {
    return { ok: false, message: "Select a supported email client." };
  }
  if (input.bodyHandling !== "PREFILLED" && input.bodyHandling !== "COPIED") {
    return { ok: false, message: "Invalid email handoff mode." };
  }
  try {
    assertGatedAction("legacyEmailSequence");
    const user = await requireCurrentUser();
    const recorded = await recordEmailClientIntent({
      draftId: input.emailDraftId,
      userId: user.id,
      client: input.client,
      bodyHandling: input.bodyHandling,
    });
    return {
      ok: true,
      message:
        input.bodyHandling === "COPIED"
          ? "Email client opened with the full body copied for you to paste. Confirm below whether you sent it."
          : "Email client opened. Confirm below whether you sent it.",
      draftId: input.emailDraftId,
      sequenceNumber: recorded.sequenceNumber,
      handoffAt: recorded.occurredAt.toISOString(),
    };
  } catch (error) {
    console.error("Failed to record email client intent.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}

export async function sendEmailDraftConnectedAction(input: {
  emailDraftId: string;
  subject: string;
  body: string;
}): Promise<GenerateEmailDraftActionResult> {
  try {
    assertGatedAction("legacyEmailSequence");
    assertGatedAction("emailConnection");
    const user = await requireCurrentUser();
    const sent = await sendEmailDraftWithConnectedMailbox({
      draftId: input.emailDraftId,
      userId: user.id,
      subject: input.subject,
      body: input.body,
    });
    revalidateCampaign(sent.campaignId);
    return {
      ok: true,
      message: sent.sendUsage.warning
        ? `Microsoft accepted the message. ${formatDailySendAdvisory(sent.sendUsage.used)}`
        : "Microsoft accepted the message from your mailbox and will save it to Sent items.",
      draftId: sent.draftId,
      sequenceNumber: sent.sequenceNumber,
      sentAt: sent.sentAt.toISOString(),
      sendUsage: sent.sendUsage,
    };
  } catch (error) {
    if (error instanceof MailboxConnectionError) {
      return {
        ok: false,
        message: error.message,
        recoveryAction: error.recovery,
      };
    }
    console.error("Failed to send email with connected mailbox.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}

export async function draftReplyAction(
  emailDraftId: string,
  prospectReply: string,
): Promise<GenerateEmailDraftActionResult> {
  const normalizedReply = prospectReply.trim();
  if (!normalizedReply) {
    return { ok: false, message: `Paste the ${vocab.prospect.singular} reply first.` };
  }
  if (normalizedReply.length > PROSPECT_REPLY_MAX_CHARS) {
    return {
      ok: false,
      message: `${vocab.prospect.Singular} reply must be ${PROSPECT_REPLY_MAX_CHARS} characters or fewer.`,
    };
  }

  try {
    assertGatedAction("legacyEmailSequence");
    const user = await requireVerifiedForAiSpend();
    const { context, sourceDraft } = await loadEmailReplyContext(
      emailDraftId,
      user.id,
    );
    const sequenceNumber = nextSequencePosition(context);
    const classification = await classifyProspectReply({
      context,
      sourceDraft,
      prospectReply: normalizedReply,
    });

    await stopSequenceForContact({
      campaignContactId: context.campaignContact.id,
      organizationId: context.organizationId,
      reason: "THEY_REPLIED",
      actorUserId: user.id,
    });

    if (
      isMeetingSchedulingReply(
        classification.classification,
        normalizedReply,
      )
    ) {
      await prisma.emailDraft.update({
        where: { id: sourceDraft.id },
        data: { prospectReplyText: normalizedReply },
      });
      revalidateCampaign(context.campaign.id);
      return {
        ok: true,
        message:
          "No draft needed — reply in your inbox. Cadence stopped because they replied.",
        noDraftNeeded: true,
        replyClassification: classification.classification,
      };
    }

    const prepared = await buildReplyEmailPrompt({
      context,
      sourceDraft,
      prospectReply: normalizedReply,
      classification: classification.classification,
    });
    const draft = await generateEmailDraft(
      context,
      prepared.messages,
      generationOptionsFromPrepared(prepared, {
        sequenceNumber,
        kind: "REPLY",
        replyClassification: classification.classification,
        prospectReplyText: normalizedReply,
        referralSuggested: classification.referralSuggested,
        inReplyToDraftId: sourceDraft.id,
        repReplyContext: normalizedReply,
      }),
    );
    revalidateCampaign(context.campaign.id);
    revalidatePath("/");
    const hasClaimConflicts = draft.claimConflicts.length > 0;
    return {
      ok: true,
      message: hasClaimConflicts
        ? `Reply drafted as Email ${sequenceNumber} with claim conflicts. Copy and send from your inbox — this app does not send replies. Cadence stopped.`
        : classification.classification === "REFERRAL"
          ? `Reply drafted as Email ${sequenceNumber}. Copy and send from your inbox — this app does not send replies. A new ${vocab.contact.singular} may need to be added. Cadence stopped.`
          : `Reply drafted as Email ${sequenceNumber}. Copy and send from your inbox — this app does not send replies. Cadence stopped.`,
      draftId: draft.draftId,
      subject: draft.subject,
      body: draft.body,
      sequenceNumber,
      kind: "REPLY",
      status: "DRAFT",
      replyClassification: classification.classification,
      referralSuggested: classification.referralSuggested,
      offerWarnings: unacknowledgedOfferWarnings(context),
      claimConflicts: draft.claimConflicts,
      emailLength: draft.emailLength,
      personaId: draft.personaId,
      personalizationTier: draft.personalizationTier,
      personalizationSources: draft.personalizationSources,
    };
  } catch (error) {
    console.error("Reply draft generation failed.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}
