import { AppActionLink } from "@/components/ui";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { getInvitationPreviewByRawToken } from "@/lib/org/signup";
import { AcceptInviteClient } from "./AcceptInviteClient";

/**
 * Invitation accept landing for `/invite/accept?token=...`.
 * Public route (middleware allowlist).
 *
 * Order of work on this page (RSC render only — no cookie writes, no accept):
 *  1. Read `token` from searchParams
 *  2. Preview invitation (email + org) by token hash
 *  3. Resolve session via getCurrentUser()
 *  4. Logged out → Create account (primary) / Sign in (secondary)
 *  5. Logged in → match/mismatch UI; accept only via Server Action POST
 */
async function AcceptInviteBody({ token }: { token: string | null }) {
  if (!token) {
    return (
      <div className="mx-auto w-full max-w-md rounded-xl border border-edge bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Invalid invitation
        </h1>
        <p className="mt-2 text-sm text-muted">
          This invitation link is missing a token. Ask your workspace admin to
          resend the invite.
        </p>
        <p className="mt-4 text-sm">
          <AppActionLink href="/login" variant="secondary">
            Sign in
          </AppActionLink>
        </p>
      </div>
    );
  }

  const preview = await getInvitationPreviewByRawToken(token);
  if (!preview) {
    return (
      <div className="mx-auto w-full max-w-md rounded-xl border border-edge bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Invitation not found
        </h1>
        <p className="mt-2 text-sm text-muted">
          This invitation link is invalid or no longer exists. Ask your
          workspace admin to send a new invite.
        </p>
      </div>
    );
  }

  const next = `/invite/accept?token=${encodeURIComponent(token)}`;
  const signupHref = `/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(preview.email)}&company=${encodeURIComponent(preview.organizationName)}`;
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md rounded-xl border border-edge bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Join {preview.organizationName}
        </h1>
        <p className="mt-2 text-sm text-muted">
          You were invited as{" "}
          <span className="font-medium text-ink">{preview.email}</span>.
          Create a password and you will join{" "}
          <span className="font-medium text-ink">
            {preview.organizationName}
          </span>
          .
        </p>
        <div className="mt-6 flex flex-col gap-3 text-sm">
          <AppActionLink
            href={signupHref}
            variant="primary"
            data-testid="invite-create-account"
          >
            Create account
          </AppActionLink>
          <AppActionLink
            href={`/login?next=${encodeURIComponent(next)}`}
            variant="secondary"
            data-testid="invite-sign-in"
          >
            Already have an account? Sign in
          </AppActionLink>
        </div>
      </div>
    );
  }

  const signedInEmail = user.email.trim().toLowerCase();
  const invitedEmail = preview.email.trim().toLowerCase();
  const emailMatches = signedInEmail === invitedEmail;

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-edge bg-surface p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Join {preview.organizationName}
      </h1>
      <div className="mt-4">
        <AcceptInviteClient
          token={token}
          invitedEmail={preview.email}
          signedInEmail={user.email}
          organizationName={preview.organizationName}
          emailMatches={emailMatches}
        />
      </div>
    </div>
  );
}

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const token = params.token?.trim() || null;

  return (
    <Suspense>
      <AcceptInviteBody token={token} />
    </Suspense>
  );
}
