import { afterEach, describe, expect, it } from "vitest";
import {
  classifyMailboxConnectionFailure,
  MailboxConnectionError,
  mailboxCallbackErrorParam,
} from "@/lib/mailbox/microsoft-oauth";

describe("mailboxCallbackErrorParam", () => {
  it("maps RETRY to connection_retry and ASK_ADMIN/RECONNECT distinctly", () => {
    expect(
      mailboxCallbackErrorParam(
        new MailboxConnectionError("X", "m", "RETRY", null, "token_exchange"),
      ),
    ).toBe("connection_retry");
    expect(
      mailboxCallbackErrorParam(
        new MailboxConnectionError("X", "m", "ASK_ADMIN", null, "token_exchange"),
      ),
    ).toBe("admin_consent_required");
    expect(
      mailboxCallbackErrorParam(
        new MailboxConnectionError("X", "m", "RECONNECT", null, "state_lookup"),
      ),
    ).toBe("reconnect_required");
    expect(mailboxCallbackErrorParam(new Error("boom"))).toBe(
      "connection_failed",
    );
  });
});

describe("classifyMailboxConnectionFailure", () => {
  it("preserves stage and provider reason for MailboxConnectionError", () => {
    const classified = classifyMailboxConnectionFailure(
      new MailboxConnectionError(
        "MICROSOFT_TOKEN_ERROR",
        "Microsoft could not complete the mailbox connection. Try again.",
        "RETRY",
        "AADSTS700016: Application not found",
        "token_exchange",
      ),
    );
    expect(classified).toMatchObject({
      stage: "token_exchange",
      code: "MICROSOFT_TOKEN_ERROR",
      recovery: "RETRY",
      providerReasonSafe: "AADSTS700016: Application not found",
    });
  });
});

describe("appAbsoluteUrl", () => {
  const originalApp = process.env.APP_URL;
  const originalPublic = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.APP_URL = originalApp;
    process.env.NEXT_PUBLIC_APP_URL = originalPublic;
  });

  it("builds redirects from APP_URL, not an internal host", async () => {
    process.env.APP_URL = "https://app.example.test";
    delete process.env.NEXT_PUBLIC_APP_URL;
    const { appAbsoluteUrl } = await import("@/lib/mailbox/microsoft-config");
    expect(appAbsoluteUrl("/settings/email?error=connection_retry")).toBe(
      "https://app.example.test/settings/email?error=connection_retry",
    );
  });
});
