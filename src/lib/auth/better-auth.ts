/**
 * Authoritative Better Auth instance — Node-safe (no server-only).
 * Next.js entry: `@/lib/auth/server` re-exports behind server-only.
 * CLI and app must share this single configuration.
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma-client";
import { getAuthEnv } from "@/lib/auth/config-core";
import { getBetterAuthIpAddressOptions } from "@/lib/auth/ip-config";
import { provisionIndividualWorkspace } from "@/lib/auth/provision-service";
import { recordAdminAuditEvent } from "@/lib/auth/audit-service";
import { sendTransactionalEmail } from "@/lib/transactional-email/send-service";
import { getTransactionalEmailConfig } from "@/lib/transactional-email/config-core";
import { isPlatformSuperAdminProvisioningActive } from "@/lib/auth/platform-provision-flag";

const authEnv = getAuthEnv();
const ipAddress = getBetterAuthIpAddressOptions();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: authEnv.secret,
  baseURL: authEnv.baseUrl,
  advanced: {
    ipAddress: {
      ipAddressHeaders: ipAddress.ipAddressHeaders,
      trustedProxies: ipAddress.trustedProxies,
    },
  },
  user: {
    modelName: "authUser",
    additionalFields: {
      firstName: {
        type: "string",
        required: true,
        input: true,
      },
      lastName: {
        type: "string",
        required: true,
        input: true,
      },
    },
  },
  session: {
    modelName: "authSession",
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  account: {
    modelName: "authAccount",
  },
  verification: {
    modelName: "authVerification",
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      // Never throw: forgot-password must stay neutral regardless of SMTP outcome.
      console.info("[auth] password-reset sendResetPassword invoked", {
        authUserId: user.id,
        email: user.email,
        resetUrlHost: (() => {
          try {
            return new URL(url).host;
          } catch {
            return "(invalid-url)";
          }
        })(),
      });
      try {
        const appUser = await prisma.user.findUnique({
          where: { authUserId: user.id },
        });
        await sendTransactionalEmail({
          templateKey: "PASSWORD_RESET",
          to: user.email,
          userId: appUser?.id,
          organizationId: appUser?.activeOrganizationId,
          variables: {
            firstName:
              (user as { firstName?: string }).firstName ||
              appUser?.firstName ||
              "there",
            resetUrl: url,
            expirationTime: "1 hour",
          },
        });
        console.info("[auth] password-reset email queued/sent", {
          authUserId: user.id,
          email: user.email,
          appUserId: appUser?.id ?? null,
        });
      } catch (error) {
        console.error("[auth] password-reset email failed", {
          authUserId: user.id,
          email: user.email,
          failureCategory:
            error instanceof Error ? error.name : "PROVIDER_ERROR",
          message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
        });
      }
    },
    onPasswordReset: async ({ user }) => {
      const appUser = await prisma.user.findUnique({
        where: { authUserId: user.id },
      });
      if (!appUser) return;
      await recordAdminAuditEvent({
        action: "PASSWORD_RESET_COMPLETED",
        actorUserId: appUser.id,
        organizationId: appUser.activeOrganizationId,
      });
      const org = appUser.activeOrganizationId
        ? await prisma.organization.findUnique({
            where: { id: appUser.activeOrganizationId },
          })
        : null;
      try {
        await sendTransactionalEmail({
          templateKey: "PASSWORD_CHANGED",
          to: appUser.email,
          userId: appUser.id,
          organizationId: appUser.activeOrganizationId,
          variables: {
            firstName: appUser.firstName || "there",
            workspaceName: org?.name || "your workspace",
          },
        });
      } catch (error) {
        console.error("[auth] password-changed email failed", {
          message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
        });
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    // Align token TTL with email copy ("24 hours"). Tokens are JWTs signed with
    // BETTER_AUTH_SECRET — rotating the secret invalidates outstanding links.
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      // CLI provisioner marks the account verified itself — do not email.
      if (isPlatformSuperAdminProvisioningActive()) {
        return;
      }
      // Pass Better Auth's `url` through unchanged — never reconstruct it.
      try {
        const appUser = await prisma.user.findUnique({
          where: { authUserId: user.id },
        });
        await sendTransactionalEmail({
          templateKey: "EMAIL_VERIFICATION",
          to: user.email,
          userId: appUser?.id,
          organizationId: appUser?.activeOrganizationId,
          variables: {
            firstName:
              (user as { firstName?: string }).firstName ||
              appUser?.firstName ||
              "there",
            verificationUrl: url,
            expirationTime: "24 hours",
          },
        });
      } catch (error) {
        console.error("[auth] verification email failed", {
          message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
        });
      }
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const firstName =
            (user as { firstName?: string }).firstName?.trim() || "User";
          const lastName =
            (user as { lastName?: string }).lastName?.trim() || "";

          let companyName: string | undefined;
          let planCode: string | undefined;
          let seatQuantity: number | undefined;
          let maxSeats: number | undefined;
          // Loud on cookie failure — do not provision Team/Standard with silent defaults.
          // Platform CLI provisioning has no request cookie jar; skip it entirely.
          if (!isPlatformSuperAdminProvisioningActive()) {
            const { readPendingSignupIntent } = await import(
              "@/lib/billing/pending-signup-intent-cookie"
            );
            const { defaultMaxSeatsForPlan } = await import(
              "@/lib/org/seat-limits"
            );
            const intent = await readPendingSignupIntent();
            if (intent?.companyName) {
              companyName = intent.companyName;
            }
            if (intent?.planCode) {
              planCode = intent.planCode;
              seatQuantity = intent.seatQuantity;
              maxSeats = defaultMaxSeatsForPlan(intent.planCode);
            }
          }

          const provisioned = await provisionIndividualWorkspace({
            authUserId: user.id,
            email: user.email,
            firstName,
            lastName,
            companyName,
            planCode,
            seatQuantity,
            maxSeats,
          });

          // Welcome is sent after verification (see session / verify hooks below)
          // Store pending welcome via idempotency when verified.
          void provisioned;
        },
      },
      update: {
        after: async (user) => {
          if (!user.emailVerified) return;
          const appUser = await prisma.user.findUnique({
            where: { authUserId: user.id },
          });
          if (!appUser) return;
          if (!appUser.emailVerifiedAt) {
            await prisma.user.update({
              where: { id: appUser.id },
              data: { emailVerifiedAt: new Date() },
            });
            await recordAdminAuditEvent({
              action: "EMAIL_VERIFIED",
              actorUserId: appUser.id,
              organizationId: appUser.activeOrganizationId,
            });
            const org = appUser.activeOrganizationId
              ? await prisma.organization.findUnique({
                  where: { id: appUser.activeOrganizationId },
                })
              : null;
            try {
              await sendTransactionalEmail({
                templateKey: "WELCOME",
                to: appUser.email,
                userId: appUser.id,
                organizationId: appUser.activeOrganizationId,
                idempotencyKey: `welcome:${appUser.id}`,
                variables: {
                  firstName: appUser.firstName || "there",
                  workspaceName: org?.name || "your workspace",
                },
              });
            } catch (error) {
              console.error("[auth] welcome email failed", {
                message:
                  error instanceof Error
                    ? error.message.slice(0, 300)
                    : "unknown",
              });
            }
          }
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          // Login / re-auth for an existing verified identity does not run
          // user.create — repair a missing workspace here.
          const authUser = await prisma.authUser.findUnique({
            where: { id: session.userId },
          });
          if (!authUser) return;
          try {
            await provisionIndividualWorkspace({
              authUserId: authUser.id,
              email: authUser.email,
              firstName:
                (authUser as { firstName?: string }).firstName?.trim() ||
                "User",
              lastName:
                (authUser as { lastName?: string }).lastName?.trim() || "",
            });
          } catch (error) {
            console.error("[auth] session workspace provision failed", {
              authUserId: authUser.id,
              message:
                error instanceof Error
                  ? error.message.slice(0, 300)
                  : "unknown",
            });
          }
        },
      },
    },
  },
  trustedOrigins: [authEnv.appUrl, authEnv.baseUrl],
});

export type AuthSession = typeof auth.$Infer.Session;

/** Expose support email for templates without leaking config elsewhere. */
export function getSupportEmail(): string {
  return getTransactionalEmailConfig().supportEmail;
}
