import "server-only";

import type { EmailLength } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveActiveOrganization } from "@/lib/auth/session";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import {
  EMAIL_BODY_MAX_CHARS,
  EMAIL_SUBJECT_MAX_CHARS,
  normalizeEmailBody,
  type EmailClient,
  type EmailClientBodyHandling,
} from "@/lib/email-generation/email-body";
import {
  releaseDailyEmailSendReservation,
  reserveDailyEmailSend,
} from "@/lib/usage/quota";
import { vocab } from "@/lib/product-config";

export function nextSequencePosition(context: EmailGenerationContext): number {
  const latest = context.sequence.at(-1);
  if (!latest) {
    throw new TenantError(
      "Generate the initial email before adding a follow-up.",
    );
  }
  if (latest.status !== "SENT" || !latest.sentAt) {
    throw new TenantError(
      `Email ${latest.sequenceNumber} must be marked as sent before another email can be added.`,
    );
  }
  return latest.sequenceNumber + 1;
}

export async function markEmailDraftSent(input: {
  draftId: string;
  userId: string;
}): Promise<{
  campaignId: string;
  campaignContactId: string;
  sequenceNumber: number;
  sentAt: Date;
  sendUsage?: {
    used: number;
    warningLimit: number;
    limit: number;
    warning: boolean;
  };
}> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new TenantError("User not found.");
  const membership = await resolveActiveOrganization(user);
  if (!membership) {
    throw new TenantError("No active organization membership was found.");
  }
  const organizationId = membership.organization.id;
  const draft = await prisma.emailDraft.findFirst({
    where: { id: input.draftId, organizationId },
    select: {
      id: true,
      campaignContactId: true,
      sequenceNumber: true,
      status: true,
      sentAt: true,
      campaignContact: {
        select: {
          campaignId: true,
          contactId: true,
          contact: { select: { email: true } },
          campaign: { select: { ownerUserId: true } },
        },
      },
    },
  });
  if (!draft) {
    throw new TenantError(
      "Email draft does not belong to the active organization.",
    );
  }
  if (draft.campaignContact.campaign.ownerUserId !== input.userId) {
    throw new TenantError(
      `This ${vocab.campaign.singular} is read-only because it belongs to another user.`,
    );
  }
  if (draft.status === "SENT" && draft.sentAt) {
    return {
      campaignId: draft.campaignContact.campaignId,
      campaignContactId: draft.campaignContactId,
      sequenceNumber: draft.sequenceNumber,
      sentAt: draft.sentAt,
    };
  }
  if (draft.status !== "DRAFT" && draft.status !== "APPROVED") {
    throw new TenantError("Only a completed draft can be marked as sent.");
  }
  const {
    assertCampaignNotArchived,
    assertEmailNotSuppressed,
  } = await import("@/lib/suppression/service");
  await assertCampaignNotArchived(
    organizationId,
    draft.campaignContact.campaignId,
  );
  await assertEmailNotSuppressed(
    organizationId,
    draft.campaignContact.contact.email,
  );

  const sentAt = new Date();
  const reservation = await reserveDailyEmailSend({
    organizationId,
    userId: input.userId,
  });
  try {
    await prisma.emailDraft.update({
      where: { id: draft.id },
      data: {
        status: "SENT",
        sentAt,
        sentMethod: "MANUAL_ASSERTION",
        sentByUserId: input.userId,
      },
    });
  } catch (error) {
    await releaseDailyEmailSendReservation({
      organizationId,
      userId: input.userId,
      periodKey: reservation.periodKey,
    });
    throw error;
  }
  try {
    await recordUsageEvent({
      organizationId,
      userId: input.userId,
      campaignId: draft.campaignContact.campaignId,
      contactId: draft.campaignContact.contactId,
      category: "EMAIL_GENERATION",
      operation: "EMAIL_DRAFT_SENT",
      status: "SUCCESS",
      metadata: {
        draftId: draft.id,
        sequenceNumber: draft.sequenceNumber,
        sentMethod: "MANUAL_ASSERTION",
        deliveryConfirmed: false,
      },
    });
  } catch (usageError) {
    console.error("Failed to record manual-send usage.", usageError);
  }
  const { recomputeCampaignContactCadence } = await import(
    "@/lib/cadence/recompute"
  );
  await recomputeCampaignContactCadence(draft.campaignContactId);
  return {
    campaignId: draft.campaignContact.campaignId,
    campaignContactId: draft.campaignContactId,
    sequenceNumber: draft.sequenceNumber,
    sentAt,
    sendUsage: {
      used: reservation.used,
      warningLimit: reservation.warningLimit,
      limit: reservation.limit,
      warning: reservation.warning,
    },
  };
}

export async function updateEmailDraftContent(input: {
  draftId: string;
  userId: string;
  subject: string;
  body: string;
  emailLength?: EmailLength | null;
}): Promise<{
  campaignId: string;
  campaignContactId: string;
  sequenceNumber: number;
  subject: string;
  body: string;
  emailLength: EmailLength | null;
  claimConflicts: import("@/lib/email-generation/claim-validation-contract").ClaimValidationViolation[];
}> {
  const subject = input.subject.trim();
  const body = normalizeEmailBody(input.body).trim();
  if (!subject) throw new TenantError("Email subject is required.");
  if (subject.length > EMAIL_SUBJECT_MAX_CHARS) {
    throw new TenantError(
      `Email subject must be ${EMAIL_SUBJECT_MAX_CHARS} characters or fewer.`,
    );
  }
  if (!body) throw new TenantError("Email body is required.");
  if (body.length > EMAIL_BODY_MAX_CHARS) {
    throw new TenantError(
      `Email body must be ${EMAIL_BODY_MAX_CHARS} characters or fewer.`,
    );
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new TenantError("User not found.");
  const membership = await resolveActiveOrganization(user);
  if (!membership) {
    throw new TenantError("No active organization membership was found.");
  }
  const draft = await prisma.emailDraft.findFirst({
    where: {
      id: input.draftId,
      organizationId: membership.organization.id,
    },
    select: {
      id: true,
      campaignContactId: true,
      sequenceNumber: true,
      status: true,
      sentAt: true,
      subject: true,
      body: true,
      generatedBody: true,
      claimConflictsJson: true,
      campaignContact: {
        select: {
          campaignId: true,
          campaign: { select: { ownerUserId: true } },
        },
      },
    },
  });
  if (!draft) {
    throw new TenantError(
      "Email draft does not belong to the active organization.",
    );
  }
  if (draft.campaignContact.campaign.ownerUserId !== input.userId) {
    throw new TenantError(
      `This ${vocab.campaign.singular} is read-only because it belongs to another user.`,
    );
  }
  if (draft.status === "SENT" || draft.sentAt) {
    throw new TenantError("Sent emails are read-only and cannot be edited.");
  }
  if (draft.status === "SENDING") {
    throw new TenantError(
      "This email is currently being sent and cannot be edited.",
    );
  }

  const { claimConflictsFromJson } = await import(
    "@/lib/email-generation/claim-conflicts"
  );
  let claimConflicts = claimConflictsFromJson(draft.claimConflictsJson);
  const contentChanged =
    (draft.subject ?? "") !== subject || (draft.body ?? "") !== body;

  if (contentChanged) {
    const { computeRepEditDelta } = await import(
      "@/lib/email-generation/claim-origin"
    );
    const { loadEmailGenerationContext } = await import(
      "@/lib/email-generation/context"
    );
    const { validateGeneratedEmailClaims } = await import(
      "@/lib/email-generation/claim-validation"
    );
    const { getEmailAiProvider } = await import("@/lib/ai");
    const repEditText = computeRepEditDelta(draft.generatedBody, body);
    try {
      const context = await loadEmailGenerationContext(
        draft.campaignContactId,
        input.userId,
      );
      const ai = getEmailAiProvider();
      const validation = await validateGeneratedEmailClaims({
        ai,
        context,
        subject,
        body,
        repEditText,
      });
      claimConflicts = validation.violations;
    } catch (error) {
      console.error(
        "Claim re-validation after draft edit failed; keeping prior flags.",
        error,
      );
    }
  }

  await prisma.emailDraft.update({
    where: { id: draft.id },
    data: {
      subject,
      body,
      status: "DRAFT",
      ...(contentChanged
        ? {
            claimConflictsJson:
              claimConflicts.length > 0 ? claimConflicts : Prisma.DbNull,
          }
        : {}),
      ...(input.emailLength ? { emailLength: input.emailLength } : {}),
    },
  });
  return {
    campaignId: draft.campaignContact.campaignId,
    campaignContactId: draft.campaignContactId,
    sequenceNumber: draft.sequenceNumber,
    subject,
    body,
    emailLength: input.emailLength ?? null,
    claimConflicts,
  };
}

export async function recordEmailClientIntent(input: {
  draftId: string;
  userId: string;
  client: EmailClient;
  bodyHandling: EmailClientBodyHandling;
}): Promise<{
  campaignId: string;
  sequenceNumber: number;
  occurredAt: Date;
}> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new TenantError("User not found.");
  const membership = await resolveActiveOrganization(user);
  if (!membership) {
    throw new TenantError("No active organization membership was found.");
  }
  const organizationId = membership.organization.id;
  const draft = await prisma.emailDraft.findFirst({
    where: { id: input.draftId, organizationId },
    select: {
      id: true,
      campaignContactId: true,
      sequenceNumber: true,
      subject: true,
      body: true,
      generatedBody: true,
      campaignContact: {
        select: {
          campaignId: true,
          contactId: true,
          contact: { select: { email: true } },
          campaign: { select: { ownerUserId: true } },
        },
      },
    },
  });
  if (!draft) {
    throw new TenantError(
      "Email draft does not belong to the active organization.",
    );
  }
  if (draft.campaignContact.campaign.ownerUserId !== input.userId) {
    throw new TenantError(
      `This ${vocab.campaign.singular} is read-only because it belongs to another user.`,
    );
  }
  const recipient = draft.campaignContact.contact.email?.trim();
  if (!draft.subject || !draft.body || !recipient) {
    throw new TenantError(
      "A recipient, subject, and body are required before opening an email client.",
    );
  }
  const {
    assertCampaignNotArchived,
    assertEmailNotSuppressed,
  } = await import("@/lib/suppression/service");
  await assertCampaignNotArchived(
    organizationId,
    draft.campaignContact.campaignId,
  );
  await assertEmailNotSuppressed(organizationId, recipient);
  const sendRecord = await prisma.emailSendRecord.create({
    data: {
      organizationId,
      emailDraftId: draft.id,
      campaignContactId: draft.campaignContactId,
      recipient,
      subject: draft.subject,
      generatedBody: draft.generatedBody ?? draft.body,
      finalBody: draft.body,
      sentByUserId: input.userId,
      method: "DEEPLINK_INTENT",
    },
  });
  try {
    await recordUsageEvent({
      organizationId,
      userId: input.userId,
      campaignId: draft.campaignContact.campaignId,
      contactId: draft.campaignContact.contactId,
      category: "EMAIL_GENERATION",
      operation: "EMAIL_DEEPLINK_OPENED",
      status: "SUCCESS",
      metadata: {
        draftId: draft.id,
        sequenceNumber: draft.sequenceNumber,
        client: input.client,
        bodyHandling: input.bodyHandling,
        markedSent: false,
      },
    });
  } catch (usageError) {
    console.error("Failed to record email-client intent usage.", usageError);
  }
  return {
    campaignId: draft.campaignContact.campaignId,
    sequenceNumber: draft.sequenceNumber,
    occurredAt: sendRecord.occurredAt,
  };
}
