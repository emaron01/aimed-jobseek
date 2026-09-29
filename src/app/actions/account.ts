"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { requireCurrentUser } from "@/lib/auth/authz";
import { recordAdminAuditEvent } from "@/lib/auth/audit";
import { resolveActiveOrganization } from "@/lib/auth/session";
import { sendTransactionalEmail } from "@/lib/transactional-email/send";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, RateLimitError } from "@/lib/auth/rate-limit";
import { wipeOrganizationAccount } from "@/lib/account/wipe-organization";
import {
  ACCOUNT_DELETED_LOGIN_QUERY,
  DELETE_MY_ACCOUNT_CONFIRM_MISMATCH_MESSAGE,
  DELETE_MY_ACCOUNT_CONFIRM_PHRASE,
  DELETE_MY_ACCOUNT_FAILURE_MESSAGE,
  DELETE_MY_ACCOUNT_NO_ORG_MESSAGE,
  DELETE_MY_ACCOUNT_OWNER_ONLY_MESSAGE,
} from "@/lib/account/delete-my-account";

export type AccountActionResult = {
  ok: boolean;
  message: string;
};

export async function logoutAction(): Promise<void> {
  // Capture actor before Better Auth invalidates the session cookie.
  const user = await requireCurrentUser().catch(() => null);

  // Authoritative session termination — Better Auth clears/invalidates cookies.
  // Do not delete cookies manually.
  await auth.api.signOut({
    headers: await headers(),
  });

  if (user) {
    await recordAdminAuditEvent({
      action: "LOGOUT",
      actorUserId: user.id,
      organizationId: user.activeOrganizationId,
    });
  }
  redirect("/login");
}

/**
 * Self-serve account delete (lifecycle B4).
 * OWNER of the active org only. Uses shared wipeOrganizationAccount.
 * Does not call requireOrganization — must work while the account is read-only.
 */
export async function deleteMyAccountAction(
  _prev: AccountActionResult | null,
  formData: FormData,
): Promise<AccountActionResult> {
  const confirmation = String(formData.get("confirmation") || "");
  if (confirmation !== DELETE_MY_ACCOUNT_CONFIRM_PHRASE) {
    return {
      ok: false,
      message: DELETE_MY_ACCOUNT_CONFIRM_MISMATCH_MESSAGE,
    };
  }

  try {
    const user = await requireCurrentUser();
    const ctx = await resolveActiveOrganization(user);
    if (!ctx?.organization) {
      return { ok: false, message: DELETE_MY_ACCOUNT_NO_ORG_MESSAGE };
    }
    if (ctx.membership.role !== "OWNER") {
      return { ok: false, message: DELETE_MY_ACCOUNT_OWNER_ONLY_MESSAGE };
    }

    await wipeOrganizationAccount({
      organizationId: ctx.organization.id,
      reason: "self_serve",
    });

    await auth.api.signOut({
      headers: await headers(),
    });

    redirect(`/login?${ACCOUNT_DELETED_LOGIN_QUERY}=1`);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    // next/navigation redirect mocks in tests throw Error("NEXT_REDIRECT:...")
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    return {
      ok: false,
      message: DELETE_MY_ACCOUNT_FAILURE_MESSAGE,
    };
  }
}

export async function changePasswordAction(
  _prev: AccountActionResult | null,
  formData: FormData,
): Promise<AccountActionResult> {
  try {
    const user = await requireCurrentUser();
    await assertRateLimit({
      key: `password-change:${user.id}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    const currentPassword = String(formData.get("currentPassword") || "");
    const newPassword = String(formData.get("newPassword") || "");
    if (newPassword.length < 10) {
      return { ok: false, message: "Password must be at least 10 characters." };
    }

    await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });

    await recordAdminAuditEvent({
      action: "PASSWORD_CHANGED",
      actorUserId: user.id,
      organizationId: user.activeOrganizationId,
    });

    const org = user.activeOrganizationId
      ? await prisma.organization.findUnique({
          where: { id: user.activeOrganizationId },
        })
      : null;

    await sendTransactionalEmail({
      templateKey: "PASSWORD_CHANGED",
      to: user.email,
      userId: user.id,
      organizationId: user.activeOrganizationId,
      variables: {
        firstName: user.firstName || "there",
        workspaceName: org?.name || "your workspace",
      },
    });

    return { ok: true, message: "Password updated." };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { ok: false, message: error.message };
    }
    const message =
      error instanceof Error ? error.message.toLowerCase() : "";
    if (
      message.includes("invalid") ||
      message.includes("incorrect") ||
      message.includes("credential") ||
      message.includes("password")
    ) {
      return {
        ok: false,
        message: "Current password is incorrect or the change was rejected.",
      };
    }
    return {
      ok: false,
      message: "Unable to update password. Please try again.",
    };
  }
}
