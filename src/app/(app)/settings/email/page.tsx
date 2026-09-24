import { EmailSignatureForm } from "@/components/EmailSignatureForm";
import { MailboxConnectionPanel } from "@/components/MailboxConnectionPanel";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMailboxConnectionView } from "@/lib/mailbox/data";
import { features } from "@/lib/product-config";
import { getEmailSignatureForUser } from "@/lib/signature/signature";
import type { EmailSignatureView } from "@/lib/signature/types";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";

type PageProps = {
  searchParams: Promise<{ mailbox?: string; error?: string }>;
};

function noticeFor(query: { mailbox?: string; error?: string }): string | null {
  if (query.mailbox === "connected") {
    return "Microsoft 365 mailbox connected.";
  }
  if (query.error === "admin_consent_required") {
    return "Your tenant requires administrator consent. Ask your Microsoft 365 administrator to approve the delegated Mail.Send permission for this app, then reconnect.";
  }
  if (query.error === "connection_declined") {
    return "Microsoft connection was canceled. Connect again when you are ready.";
  }
  if (query.error === "reconnect_required") {
    return "The connection request expired or was invalid. Start the connection again.";
  }
  if (query.error === "connection_retry") {
    return "Microsoft could not finish connecting right now. Wait a moment and try Connect Microsoft 365 again.";
  }
  if (query.error === "connection_unavailable") {
    return "Mailbox connection is unavailable. Check Microsoft app settings and try again.";
  }
  if (query.error === "invalid_callback") {
    return "Microsoft returned an incomplete connection response. Start the connection again.";
  }
  if (query.error) {
    return "Microsoft 365 could not be connected. Check the app registration and try again.";
  }
  return null;
}

export default async function EmailSettingsPage({ searchParams }: PageProps) {
  const [user, organization, query] = await Promise.all([
    requireCurrentUser(),
    requireOrganization(),
    searchParams,
  ]);
  const showMailbox = features.emailConnection;
  const connection = showMailbox
    ? await getMailboxConnectionView({
        organizationId: organization.id,
        userId: user.id,
      })
    : null;

  let signature: EmailSignatureView | null = null;
  let signatureLoadError: string | null = null;
  try {
    signature = await getEmailSignatureForUser({
      organizationId: organization.id,
      userId: user.id,
    });
  } catch (error) {
    console.error("Failed to load email signature for settings/email.", error);
    signatureLoadError =
      "Signature storage is not available yet. Apply the latest database migrations, then reload this page.";
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {showMailbox ? "Email connection" : "Email signature"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {showMailbox
            ? "Connect a personal mailbox for direct sending. Connections belong to you within this workspace and cannot be used by another member. The signature below is appended on Connected Send and when you open Gmail or Outlook on the web. Outlook Desktop uses your Outlook signature instead."
            : "Appended when you open a draft in Outlook or Gmail. Outlook desktop uses the signature stored in Outlook."}
        </p>
      </div>
      {showMailbox ? (
        <MailboxConnectionPanel
          connection={
            connection
              ? {
                  status: connection.status,
                  mailboxAddress: connection.mailboxAddress,
                  connectedAt: connection.connectedAt.toISOString(),
                }
              : null
          }
          notice={noticeFor(query)}
        />
      ) : null}
      {signatureLoadError ? (
        <p
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          {signatureLoadError}
        </p>
      ) : (
        <EmailSignatureForm signature={signature} />
      )}
    </div>
  );
}
