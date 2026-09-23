import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { seedContactOnList } from "@/test/contact-seed";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("connected-send production language", () => {
  it("contains no product-specific vocabulary", () => {
    const files = [
      "src/lib/mailbox/crypto.ts",
      "src/lib/mailbox/data.ts",
      "src/lib/mailbox/microsoft-config.ts",
      "src/lib/mailbox/microsoft-graph.ts",
      "src/lib/mailbox/microsoft-oauth.ts",
      "src/lib/mailbox/provider.ts",
      "src/lib/mailbox/send.ts",
      "src/app/actions/mailbox.ts",
      "src/app/api/mailbox/microsoft/connect/route.ts",
      "src/app/api/mailbox/microsoft/callback/route.ts",
      "src/app/(app)/settings/email/page.tsx",
      "src/components/MailboxConnectionPanel.tsx",
    ];
    const source = files
      .map((file) => readFileSync(join(process.cwd(), file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(
      /ForecastWorks|forecast audit|forecast accuracy|revenue intelligence/i,
    );
  });

  it("mailbox OAuth redirects use APP_URL, not request.url as redirect base", () => {
    const callback = readFileSync(
      "src/app/api/mailbox/microsoft/callback/route.ts",
      "utf8",
    );
    const connect = readFileSync(
      "src/app/api/mailbox/microsoft/connect/route.ts",
      "utf8",
    );
    expect(callback).toContain("appAbsoluteUrl");
    expect(connect).toContain("appAbsoluteUrl");
    expect(callback).not.toMatch(/NextResponse\.redirect\(\s*\n?\s*new URL\([^)]*request\.url/);
    expect(connect).not.toMatch(
      /NextResponse\.redirect\(\s*\n?\s*new URL\([^)]*request\.url/,
    );
    expect(callback).toContain("logMailboxConnectionFailure");
    expect(callback).toContain("mailboxCallbackErrorParam");
  });

  it("authorize URL carries exactly one prompt value (consent)", () => {
    const oauth = readFileSync("src/lib/mailbox/microsoft-oauth.ts", "utf8");
    const graph = readFileSync("src/lib/mailbox/microsoft-graph.ts", "utf8");
    const promptSets = [
      ...oauth.matchAll(/searchParams\.set\(\s*"prompt",\s*"([^"]*)"\s*\)/g),
    ];
    expect(promptSets).toHaveLength(1);
    expect(promptSets[0]?.[1]).toBe("consent");
    expect(promptSets[0]?.[1]?.includes(" ")).toBe(false);
    expect(graph).toContain("mailbox_microsoft_send_failed");
    expect(graph).toContain("logSendFailure");
  });
});

describe("mailbox secret encryption", () => {
  it("authenticates ciphertext against its user scope", async () => {
    process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64",
    );
    const {
      decryptMailboxSecret,
      encryptMailboxSecret,
      mailboxSecretAad,
    } = await import("@/lib/mailbox/crypto");
    const aadA = mailboxSecretAad({
      organizationId: "org",
      userId: "user-a",
      provider: "MICROSOFT_365",
      purpose: "access",
    });
    const aadB = mailboxSecretAad({
      organizationId: "org",
      userId: "user-b",
      provider: "MICROSOFT_365",
      purpose: "access",
    });
    const encrypted = encryptMailboxSecret("token-value", aadA);
    expect(encrypted).not.toContain("token-value");
    expect(decryptMailboxSecret(encrypted, aadA)).toBe("token-value");
    expect(() => decryptMailboxSecret(encrypted, aadB)).toThrow();
  });
});

describe.skipIf(!hasDatabase)(
  "Microsoft 365 connected send",
  { timeout: 60_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let organizationId = "";
    let userAId = "";
    let userBId = "";
    let campaignContactId = "";
    let nextSequence = 50;
    const suffix = Date.now().toString(36);

    beforeAll(async () => {
      process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
        "base64",
      );
      process.env.MICROSOFT_CLIENT_ID = "test-client";
      process.env.MICROSOFT_CLIENT_SECRET = "test-secret";
      process.env.MICROSOFT_REDIRECT_URI =
        "http://localhost:3000/api/mailbox/microsoft/callback";
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const primary = await createIndividualWorkspace({
        email: `mailbox-a-${suffix}@example.test`,
        name: "Mailbox A",
      });
      organizationId = primary.organization.id;
      userAId = primary.user.id;
      await prisma.user.update({
        where: { id: userAId },
        data: { emailVerifiedAt: new Date() },
      });
      const userB = await prisma.user.create({
        data: {
          email: `mailbox-b-${suffix}@example.test`,
          emailNormalized: `mailbox-b-${suffix}@example.test`,
          name: "[TEST] Mailbox B",
          activeOrganizationId: organizationId,
        },
      });
      userBId = userB.id;
      await prisma.organizationMembership.create({
        data: {
          organizationId,
          userId: userBId,
          role: "MEMBER",
        },
      });
      const product = await prisma.product.create({
        data: { organizationId, name: "General platform" },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId,
          productId: product.id,
          name: "General organizations",
          definition: "Organizations with an operational need",
        },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId,
          productId: product.id,
          name: "Operations leader",
        },
      });
      const list = await prisma.contactList.create({
        data: {
          organizationId,
          ownerUserId: userAId,
          name: "Mailbox contacts",
          sourceType: "PASTE",
          totalContacts: 1,
        },
      });
      const contact = await seedContactOnList(prisma, {
        organizationId,
        contactListId: list.id,
        firstName: "Alex",
        email: `recipient-${suffix}@example.test`,
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userAId,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          name: "Mailbox campaign",
        },
      });
      const campaignContact = await prisma.campaignContact.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          contactId: contact.id,
          status: "SELECTED",
        },
      });
      campaignContactId = campaignContact.id;
    });

    afterAll(async () => {
      vi.unstubAllGlobals();
      if (prisma) {
        await prisma.organization.deleteMany({
          where: { id: organizationId },
        });
        await prisma.user.deleteMany({
          where: { id: { in: [userAId, userBId] } },
        });
        await prisma.$disconnect();
      }
    });

    async function encryptedTokens(userId: string) {
      const { encryptMailboxSecret, mailboxSecretAad } = await import(
        "@/lib/mailbox/crypto"
      );
      return {
        encryptedAccessToken: encryptMailboxSecret(
          "access-token",
          mailboxSecretAad({
            organizationId,
            userId,
            provider: "MICROSOFT_365",
            purpose: "access",
          }),
        ),
        encryptedRefreshToken: encryptMailboxSecret(
          "refresh-token",
          mailboxSecretAad({
            organizationId,
            userId,
            provider: "MICROSOFT_365",
            purpose: "refresh",
          }),
        ),
      };
    }

    async function connect(
      userId: string,
      accessTokenExpiresAt: Date,
    ): Promise<void> {
      const tokens = await encryptedTokens(userId);
      await prisma.mailboxConnection.upsert({
        where: {
          organizationId_userId_provider: {
            organizationId,
            userId,
            provider: "MICROSOFT_365",
          },
        },
        create: {
          organizationId,
          userId,
          provider: "MICROSOFT_365",
          mailboxAddress: `${userId}@example.test`,
          providerAccountId: `provider-${userId}`,
          accessTokenExpiresAt,
          grantedScopesJson: ["Mail.Send"],
          ...tokens,
        },
        update: {
          status: "CONNECTED",
          lastErrorCode: null,
          accessTokenExpiresAt,
          ...tokens,
        },
      });
    }

    async function draft() {
      return prisma.emailDraft.create({
        data: {
          organizationId,
          campaignContactId,
          sequenceNumber: nextSequence++,
          subject: "Original subject",
          body: "Original body",
          status: "DRAFT",
        },
      });
    }

    it("never uses another user connection in the same organization", async () => {
      await connect(userAId, new Date(Date.now() + 60 * 60 * 1000));
      const { getMicrosoftAccessToken } = await import(
        "@/lib/mailbox/microsoft-oauth"
      );
      await expect(
        getMicrosoftAccessToken({ organizationId, userId: userBId }),
      ).rejects.toMatchObject({
        code: "RECONNECT_REQUIRED",
        recovery: "RECONNECT",
      });
    });

    it("requires a verified account before connected sending", async () => {
      const emailDraft = await draft();
      const provider = {
        id: "MICROSOFT_365" as const,
        send: vi.fn(),
      };
      const { sendEmailDraftWithConnectedMailbox } = await import(
        "@/lib/mailbox/send"
      );
      await expect(
        sendEmailDraftWithConnectedMailbox({
          draftId: emailDraft.id,
          userId: userBId,
          subject: "Subject",
          body: "Body",
          provider,
        }),
      ).rejects.toThrow(
        "Verify your email address to continue with this action.",
      );
      expect(provider.send).not.toHaveBeenCalled();
    });

    it("refreshes an expired access token", async () => {
      await connect(userAId, new Date(Date.now() - 60_000));
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "refreshed-access",
            refresh_token: "rotated-refresh",
            expires_in: 3600,
            scope: "Mail.Send",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { getMicrosoftAccessToken } = await import(
        "@/lib/mailbox/microsoft-oauth"
      );
      const token = await getMicrosoftAccessToken({
        organizationId,
        userId: userAId,
      });
      expect(token.accessToken).toBe("refreshed-access");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("prompts reconnect after failed refresh and preserves the draft", async () => {
      const emailDraft = await draft();
      await connect(userAId, new Date(Date.now() - 60_000));
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: "invalid_grant",
              error_description: "The refresh token was revoked.",
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          ),
        ),
      );
      const { sendEmailDraftWithConnectedMailbox } = await import(
        "@/lib/mailbox/send"
      );
      await expect(
        sendEmailDraftWithConnectedMailbox({
          draftId: emailDraft.id,
          userId: userAId,
          subject: "Edited subject",
          body: "Edited body",
        }),
      ).rejects.toMatchObject({
        code: "RECONNECT_REQUIRED",
        recovery: "RECONNECT",
      });
      expect(
        await prisma.emailDraft.findUniqueOrThrow({
          where: { id: emailDraft.id },
          select: { status: true, subject: true, body: true, sentAt: true },
        }),
      ).toEqual({
        status: "DRAFT",
        subject: "Edited subject",
        body: "Edited body",
        sentAt: null,
      });
      expect(
        await prisma.mailboxConnection.findUniqueOrThrow({
          where: {
            organizationId_userId_provider: {
              organizationId,
              userId: userAId,
              provider: "MICROSOFT_365",
            },
          },
          select: { status: true },
        }),
      ).toEqual({ status: "RECONNECT_REQUIRED" });
    });

    it("keeps a rejected Graph send editable and unsent", async () => {
      const emailDraft = await draft();
      await connect(userAId, new Date(Date.now() + 60 * 60 * 1000));
      await prisma.userUsageOverride.upsert({
        where: {
          organizationId_userId: { organizationId, userId: userAId },
        },
        create: {
          organizationId,
          userId: userAId,
          dailyEmailSendWarningLimit: 1,
          dailyEmailSendLimit: 2,
        },
        update: {
          dailyEmailSendWarningLimit: 1,
          dailyEmailSendLimit: 2,
        },
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                code: "ErrorInvalidRecipients",
                message: "The recipient address is invalid.",
              },
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          ),
        ),
      );
      const { sendEmailDraftWithConnectedMailbox } = await import(
        "@/lib/mailbox/send"
      );
      await expect(
        sendEmailDraftWithConnectedMailbox({
          draftId: emailDraft.id,
          userId: userAId,
          subject: "Final subject",
          body: "First paragraph.\n\nSecond paragraph.",
        }),
      ).rejects.toMatchObject({
        code: "SEND_REJECTED",
        recovery: "EDIT_DRAFT",
      });
      const saved = await prisma.emailDraft.findUniqueOrThrow({
        where: { id: emailDraft.id },
      });
      expect(saved.status).toBe("DRAFT");
      expect(saved.sentAt).toBeNull();
      expect(saved.body).toBe("First paragraph.\n\nSecond paragraph.");
    });

    it("marks sent and records IDs only after a provider response", async () => {
      const emailDraft = await draft();
      await connect(userAId, new Date(Date.now() + 60 * 60 * 1000));
      const acceptedAt = new Date("2026-08-24T20:40:00.000Z");
      const provider = {
        id: "MICROSOFT_365" as const,
        send: vi.fn().mockResolvedValue({
          provider: "MICROSOFT_365" as const,
          acceptedAt,
          providerMessageId: "provider-message-123",
          providerRequestId: "graph-request-123",
        }),
      };
      const { sendEmailDraftWithConnectedMailbox } = await import(
        "@/lib/mailbox/send"
      );
      const sent = await sendEmailDraftWithConnectedMailbox({
        draftId: emailDraft.id,
        userId: userAId,
        subject: "Final subject",
        body: "First paragraph.\n\nSecond paragraph.",
        provider,
      });
      expect(sent.sentAt.toISOString()).toBe("2026-08-24T20:40:00.000Z");
      expect(sent.providerRequestId).toBe("graph-request-123");
      expect(sent.providerMessageId).toBe("provider-message-123");
      expect(sent.sendUsage).toMatchObject({
        used: 1,
        warningLimit: 1,
        limit: 1,
        warning: true,
      });
      expect(
        await prisma.emailDraft.findUniqueOrThrow({
          where: { id: emailDraft.id },
          select: {
            status: true,
            sentAt: true,
            sentMethod: true,
            sentByUserId: true,
          },
        }),
      ).toEqual({
        status: "SENT",
        sentAt: acceptedAt,
        sentMethod: "CONNECTED_PROVIDER",
        sentByUserId: userAId,
      });
      expect(
        await prisma.emailSendRecord.findFirstOrThrow({
          where: { emailDraftId: emailDraft.id, method: "MICROSOFT_GRAPH" },
          select: {
            generatedBody: true,
            finalBody: true,
            providerMessageId: true,
            providerRequestId: true,
            occurredAt: true,
          },
        }),
      ).toEqual({
        generatedBody: "Original body",
        finalBody: "First paragraph.\n\nSecond paragraph.",
        providerMessageId: "provider-message-123",
        providerRequestId: "graph-request-123",
        occurredAt: acceptedAt,
      });
    });

    it("appends the user signature to Graph send but not to the stored draft", async () => {
      const emailDraft = await draft();
      await connect(userAId, new Date(Date.now() + 60 * 60 * 1000));
      await prisma.emailSignature.upsert({
        where: {
          organizationId_userId: {
            organizationId,
            userId: userAId,
          },
        },
        create: {
          organizationId,
          userId: userAId,
          body: "Alex Rivera\nhttps://example.com/meet",
          active: true,
        },
        update: {
          body: "Alex Rivera\nhttps://example.com/meet",
          active: true,
        },
      });
      const provider = {
        id: "MICROSOFT_365" as const,
        send: vi.fn().mockResolvedValue({
          provider: "MICROSOFT_365" as const,
          acceptedAt: new Date("2026-08-24T21:00:00.000Z"),
          providerMessageId: "provider-message-sig",
          providerRequestId: "graph-request-sig",
        }),
      };
      const { sendEmailDraftWithConnectedMailbox } = await import(
        "@/lib/mailbox/send"
      );
      await sendEmailDraftWithConnectedMailbox({
        draftId: emailDraft.id,
        userId: userAId,
        subject: "Signed subject",
        body: "Would this be useful?",
        provider,
      });
      expect(provider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Would this be useful?",
          signatureText: "Alex Rivera\nhttps://example.com/meet",
          signatureHtml: null,
        }),
      );
      expect(
        await prisma.emailDraft.findUniqueOrThrow({
          where: { id: emailDraft.id },
          select: { body: true },
        }),
      ).toEqual({ body: "Would this be useful?" });
      expect(
        await prisma.emailSendRecord.findFirstOrThrow({
          where: { emailDraftId: emailDraft.id },
          select: { finalBody: true },
        }),
      ).toEqual({
        finalBody:
          "Would this be useful?\n\nAlex Rivera\nhttps://example.com/meet",
      });
    });

    it("warns at the advisory threshold but never hard-blocks a send", async () => {
      const emailDraft = await draft();
      await connect(userAId, new Date(Date.now() + 60 * 60 * 1000));
      await prisma.userUsageOverride.upsert({
        where: {
          organizationId_userId: { organizationId, userId: userAId },
        },
        create: {
          organizationId,
          userId: userAId,
          dailyEmailSendWarningLimit: 1,
          dailyEmailSendLimit: 1,
        },
        update: {
          dailyEmailSendWarningLimit: 1,
          dailyEmailSendLimit: 1,
        },
      });
      const { getOrganizationDayKey } = await import("@/lib/usage/timezone");
      const org = await prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { timezone: true },
      });
      await prisma.usageQuotaLedger.upsert({
        where: {
          organizationId_userId_resource_periodKey: {
            organizationId,
            userId: userAId,
            resource: "EMAIL_SEND",
            periodKey: getOrganizationDayKey(org.timezone),
          },
        },
        create: {
          organizationId,
          userId: userAId,
          resource: "EMAIL_SEND",
          periodKey: getOrganizationDayKey(org.timezone),
          consumed: 5,
        },
        update: { consumed: 5 },
      });
      const provider = {
        id: "MICROSOFT_365" as const,
        send: vi.fn().mockResolvedValue({
          provider: "MICROSOFT_365" as const,
          acceptedAt: new Date("2026-08-24T20:45:00.000Z"),
          providerMessageId: "provider-message-limit",
          providerRequestId: "graph-request-limit",
        }),
      };
      const { sendEmailDraftWithConnectedMailbox } = await import(
        "@/lib/mailbox/send"
      );
      const sent = await sendEmailDraftWithConnectedMailbox({
        draftId: emailDraft.id,
        userId: userAId,
        subject: "Advisory subject",
        body: "Advisory body",
        provider,
      });
      expect(sent.sendUsage.warning).toBe(true);
      expect(sent.sendUsage.used).toBe(6);
      expect(provider.send).toHaveBeenCalledTimes(1);
      expect(
        await prisma.emailDraft.findUniqueOrThrow({
          where: { id: emailDraft.id },
          select: { status: true },
        }),
      ).toEqual({ status: "SENT" });
    });
  },
);
