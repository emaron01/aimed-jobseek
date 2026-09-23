import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  EMAIL_BODY_MAX_CHARS,
  EMAIL_SUBJECT_MAX_CHARS,
  appendEmailSignature,
  normalizeEmailBody,
} from "@/lib/email-generation/email-body";
import {
  getConnectedEmailProvider,
  type ConnectedEmailProvider,
} from "@/lib/mailbox/provider";
import { getEmailSignatureForSend } from "@/lib/signature/signature";
import { resolveActiveOrganization } from "@/lib/auth/session";
import { assertAccountCapability } from "@/lib/auth/account-policy";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import {
  releaseDailyEmailSendReservation,
  reserveDailyEmailSend,
} from "@/lib/usage/quota";
import { vocab } from "@/lib/product-config";

const STALE_SEND_ATTEMPT_MS = 5 * 60 * 1000;

export type ConnectedSendResult = {
  draftId: string;
  campaignId: string;
  sequenceNumber: number;
  sentAt: Date;
  providerMessageId: string | null;
  providerRequestId: string | null;
  sendUsage: {
    used: number;
    warningLimit: number;
    limit: number;
    warning: boolean;
  };
};

export async function sendEmailDraftWithConnectedMailbox(input: {
  draftId: string;
  userId: string;
  subject: string;
  body: string;
  provider?: ConnectedEmailProvider;
}): Promise<ConnectedSendResult> {
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
  assertAccountCapability(user, "OUTBOUND_EMAIL");
  const membership = await resolveActiveOrganization(user);
  if (!membership) {
    throw new TenantError("No active organization membership was found.");
  }
  const organizationId = membership.organization.id;
  const signature = await getEmailSignatureForSend({
    organizationId,
    userId: input.userId,
  });
  const finalBodyForRecord = appendEmailSignature(body, signature.text);
  if (finalBodyForRecord.length > EMAIL_BODY_MAX_CHARS) {
    throw new TenantError(
      `Email body plus signature must be ${EMAIL_BODY_MAX_CHARS} characters or fewer.`,
    );
  }
  const draft = await prisma.emailDraft.findFirst({
    where: { id: input.draftId, organizationId },
    select: {
      id: true,
      status: true,
      sentAt: true,
      body: true,
      generatedBody: true,
      campaignContactId: true,
      sequenceNumber: true,
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
  if (draft.status === "SENT" || draft.sentAt) {
    throw new TenantError("This email has already been sent.");
  }
  const recipient = draft.campaignContact.contact.email?.trim();
  if (!recipient) {
    throw new TenantError(`Add an email address to this ${vocab.contact.singular} before sending.`);
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

  const attemptId = randomUUID();
  const reservation = await reserveDailyEmailSend({
    organizationId,
    userId: input.userId,
  });
  const claimed = await prisma.emailDraft.updateMany({
    where: {
      id: draft.id,
      organizationId,
      sentAt: null,
      OR: [
        { status: { in: ["DRAFT", "APPROVED"] } },
        {
          status: "SENDING",
          sendAttemptStartedAt: {
            lt: new Date(Date.now() - STALE_SEND_ATTEMPT_MS),
          },
        },
      ],
    },
    data: {
      subject,
      body,
      status: "SENDING",
      sendAttemptId: attemptId,
      sendAttemptStartedAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    await releaseDailyEmailSendReservation({
      organizationId,
      userId: input.userId,
      periodKey: reservation.periodKey,
    });
    throw new TenantError(
      "This email is already being sent. Wait for the current attempt to finish.",
    );
  }

  try {
    const provider =
      input.provider ?? (await getConnectedEmailProvider("MICROSOFT_365"));
    const sent = await provider.send({
      organizationId,
      userId: input.userId,
      to: recipient,
      subject,
      body,
      signatureText: signature.text,
      signatureHtml: signature.html,
    });
    await prisma.$transaction(async (tx) => {
      const completed = await tx.emailDraft.updateMany({
        where: {
          id: draft.id,
          organizationId,
          status: "SENDING",
          sendAttemptId: attemptId,
        },
        data: {
          status: "SENT",
          sentAt: sent.acceptedAt,
          sentMethod: "CONNECTED_PROVIDER",
          sentByUserId: input.userId,
          sendAttemptId: null,
          sendAttemptStartedAt: null,
        },
      });
      if (completed.count !== 1) {
        throw new Error("Connected send state could not be finalized.");
      }
      await tx.emailSendRecord.create({
        data: {
          organizationId,
          emailDraftId: draft.id,
          campaignContactId: draft.campaignContactId,
          recipient,
          subject,
          generatedBody: draft.generatedBody ?? draft.body ?? body,
          finalBody: finalBodyForRecord,
          sentByUserId: input.userId,
          method: "MICROSOFT_GRAPH",
          occurredAt: sent.acceptedAt,
          providerMessageId: sent.providerMessageId,
          providerRequestId: sent.providerRequestId,
        },
      });
    });
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
          sentMethod: "CONNECTED_PROVIDER",
          provider: sent.provider,
          providerMessageId: sent.providerMessageId,
          providerRequestId: sent.providerRequestId,
          acceptedByProvider: true,
        },
      });
    } catch (usageError) {
      console.error("Failed to record connected-send usage.", usageError);
    }
    const { recomputeCampaignContactCadence } = await import(
      "@/lib/cadence/recompute"
    );
    await recomputeCampaignContactCadence(draft.campaignContactId);
    return {
      draftId: draft.id,
      campaignId: draft.campaignContact.campaignId,
      sequenceNumber: draft.sequenceNumber,
      sentAt: sent.acceptedAt,
      providerMessageId: sent.providerMessageId,
      providerRequestId: sent.providerRequestId,
      sendUsage: {
        used: reservation.used,
        warningLimit: reservation.warningLimit,
        limit: reservation.limit,
        warning: reservation.warning,
      },
    };
  } catch (error) {
    await prisma.emailDraft.updateMany({
      where: {
        id: draft.id,
        organizationId,
        status: "SENDING",
        sendAttemptId: attemptId,
      },
      data: {
        status: "DRAFT",
        sendAttemptId: null,
        sendAttemptStartedAt: null,
      },
    });
    await releaseDailyEmailSendReservation({
      organizationId,
      userId: input.userId,
      periodKey: reservation.periodKey,
    });
    throw error;
  }
}
