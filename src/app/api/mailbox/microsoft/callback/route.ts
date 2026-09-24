import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { assertAccountCapability } from "@/lib/auth/account-policy";
import { appAbsoluteUrl } from "@/lib/mailbox/microsoft-config";
import {
  classifyMailboxConnectionFailure,
  completeMicrosoftMailboxConnection,
  logMailboxConnectionFailure,
  mailboxCallbackErrorParam,
} from "@/lib/mailbox/microsoft-oauth";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";
import { requireGatedPage } from "@/lib/product-config/feature-access";

function redirectToEmailSettings(query: Record<string, string>): NextResponse {
  const url = new URL(appAbsoluteUrl("/settings/email"));
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  requireGatedPage("emailConnection");
  const requestUrl = new URL(request.url);
  const providerError = requestUrl.searchParams.get("error");
  if (providerError) {
    const description =
      requestUrl.searchParams.get("error_description") ?? providerError;
    const adminConsent =
      /admin|consent_required|aadsts65001|aadsts90094/i.test(description);
    return redirectToEmailSettings({
      error: adminConsent ? "admin_consent_required" : "connection_declined",
    });
  }
  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  if (!state || !code) {
    return redirectToEmailSettings({ error: "invalid_callback" });
  }
  try {
    const [user, organization] = await Promise.all([
      requireCurrentUser(),
      requireOrganization(),
    ]);
    assertAccountCapability(user, "OUTBOUND_EMAIL");
    const connected = await completeMicrosoftMailboxConnection({
      organizationId: organization.id,
      userId: user.id,
      state,
      code,
    });
    const destination = new URL(
      appAbsoluteUrl(connected.returnPath || "/settings/email"),
    );
    destination.searchParams.set("mailbox", "connected");
    return NextResponse.redirect(destination);
  } catch (error) {
    const classified = classifyMailboxConnectionFailure(error);
    logMailboxConnectionFailure({
      event: "mailbox_microsoft_connection_failed",
      ...classified,
    });
    return redirectToEmailSettings({
      error: mailboxCallbackErrorParam(error),
    });
  }
}
