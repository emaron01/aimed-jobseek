import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { assertAccountCapability } from "@/lib/auth/account-policy";
import { appAbsoluteUrl } from "@/lib/mailbox/microsoft-config";
import {
  beginMicrosoftMailboxConnection,
  classifyMailboxConnectionFailure,
  logMailboxConnectionFailure,
  MailboxConnectionError,
} from "@/lib/mailbox/microsoft-oauth";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";
import { assertOrganizationNotPaymentLocked } from "@/lib/billing/payment-lock";
import { requireGatedPage } from "@/lib/product-config/feature-access";

export async function GET(request: Request) {
  requireGatedPage("emailConnection");
  try {
    const [user, organization] = await Promise.all([
      requireCurrentUser(),
      requireOrganization(),
    ]);
    await assertOrganizationNotPaymentLocked(organization.id);
    const returnPath = new URL(request.url).searchParams.get("returnTo");
    assertAccountCapability(user, "OUTBOUND_EMAIL");
    const authorizationUrl = await beginMicrosoftMailboxConnection({
      organizationId: organization.id,
      userId: user.id,
      returnPath,
    });
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    const classified = classifyMailboxConnectionFailure(error);
    logMailboxConnectionFailure({
      event: "mailbox_microsoft_connection_failed",
      stage:
        classified.stage === "unknown" ? "begin_authorize" : classified.stage,
      code:
        error instanceof MailboxConnectionError
          ? classified.code
          : "CONNECTION_UNAVAILABLE",
      recovery: classified.recovery,
      providerReasonSafe: classified.providerReasonSafe,
      messageSafe: classified.messageSafe,
    });
    return NextResponse.redirect(
      appAbsoluteUrl("/settings/email?error=connection_unavailable"),
    );
  }
}
