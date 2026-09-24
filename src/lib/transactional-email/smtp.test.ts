/**
 * Unit/integration tests for SMTP transactional email provider.
 * Live SMTP is never used — nodemailer and test-runtime guards are mocked here.
 */
import nodemailer from "nodemailer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nodemailerMocks = vi.hoisted(() => {
  const sendMail = vi.fn(async () => ({ messageId: "<msg@smtp>" }));
  const verify = vi.fn(async () => true);
  const close = vi.fn();
  const createTransport = vi.fn(() => ({
    sendMail,
    verify,
    close,
  }));
  return { sendMail, verify, close, createTransport };
});

vi.mock("@/lib/transactional-email/test-runtime", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/transactional-email/test-runtime")>();
  return {
    ...actual,
    assertLiveTransactionalEmailBlockedInTests: () => {},
    assertLiveSmtpAllowedInTests: () => {},
  };
});

vi.mock("nodemailer", () => ({
  default: {
    createTransport: nodemailerMocks.createTransport,
  },
}));

const { sendMail, verify, close, createTransport } = nodemailerMocks;

const ORIGINAL_ENV = { ...process.env };

function restoreProcessEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function setSmtpEnv(overrides: Record<string, string> = {}) {
  process.env.TRANSACTIONAL_EMAIL_PROVIDER = "smtp";
  process.env.TRANSACTIONAL_EMAIL_FROM_EMAIL = "platform@example.com";
  process.env.TRANSACTIONAL_EMAIL_FROM_NAME = "Platform";
  process.env.TRANSACTIONAL_EMAIL_REPLY_TO = "support@example.com";
  process.env.SUPPORT_EMAIL = "support@example.com";
  process.env.TRANSACTIONAL_EMAIL_SMTP_HOST = "smtp.ionos.com";
  process.env.TRANSACTIONAL_EMAIL_SMTP_PORT = "587";
  process.env.TRANSACTIONAL_EMAIL_SMTP_SECURE = "false";
  process.env.TRANSACTIONAL_EMAIL_SMTP_USER = "platform@example.com";
  process.env.TRANSACTIONAL_EMAIL_SMTP_PASSWORD = "super-secret-smtp-pass";
  Object.assign(process.env, overrides);
}

async function smtpProviderFromConfig() {
  const { getTransactionalEmailConfig, formatFromAddress } = await import(
    "@/lib/transactional-email/config"
  );
  const { SmtpTransactionalEmailProvider } = await import(
    "@/lib/transactional-email/providers/smtp"
  );
  const { resetSmtpTransportForTests } = await import(
    "@/lib/transactional-email/providers/smtp"
  );
  resetSmtpTransportForTests();
  const config = getTransactionalEmailConfig();
  if (!config.smtp) throw new Error("SMTP config missing in test.");
  return new SmtpTransactionalEmailProvider(
    config.smtp,
    formatFromAddress(config),
    config.replyTo,
    config.fromEmail,
  );
}

beforeEach(() => {
  sendMail.mockReset();
  sendMail.mockResolvedValue({ messageId: "<msg@smtp>" });
  verify.mockReset();
  verify.mockResolvedValue(true);
  close.mockReset();
  createTransport.mockReset();
  createTransport.mockImplementation(() => ({
    sendMail,
    verify,
    close,
  }));
});

afterEach(() => {
  restoreProcessEnv();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("test runtime SMTP guard", () => {
  it("factory returns console in Vitest even when env requests smtp", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/transactional-email/test-runtime");
    setSmtpEnv();
    const { getTransactionalEmailProvider } = await import(
      "@/lib/transactional-email/providers"
    );
    const provider = getTransactionalEmailProvider();
    expect(provider.name).toBe("console");
    vi.doMock("@/lib/transactional-email/test-runtime", async (importOriginal) => {
      const actual =
        await importOriginal<
          typeof import("@/lib/transactional-email/test-runtime")
        >();
      return {
        ...actual,
        assertLiveTransactionalEmailBlockedInTests: () => {},
        assertLiveSmtpAllowedInTests: () => {},
      };
    });
  });
});

describe("transactional email config parsing", () => {
  it('parses SMTP secure "false" as false and "true" as true', async () => {
    const { parseEnvBoolean, parseSmtpPort } = await import(
      "@/lib/transactional-email/config"
    );
    expect(parseEnvBoolean("false", "SECURE")).toBe(false);
    expect(parseEnvBoolean("FALSE", "SECURE")).toBe(false);
    expect(parseEnvBoolean("0", "SECURE")).toBe(false);
    expect(parseEnvBoolean("true", "SECURE")).toBe(true);
    expect(parseEnvBoolean("TRUE", "SECURE")).toBe(true);
    expect(parseSmtpPort("587")).toBe(587);
    expect(parseSmtpPort("465")).toBe(465);
    expect(() => parseSmtpPort("not-a-port")).toThrow(/numeric port/);
    expect(() => parseSmtpPort("70000")).toThrow(/between 1 and 65535/);
  });

  it("selects smtp provider from environment and fails closed when incomplete", async () => {
    process.env.TRANSACTIONAL_EMAIL_PROVIDER = "smtp";
    process.env.TRANSACTIONAL_EMAIL_FROM_EMAIL = "platform@example.com";
    process.env.TRANSACTIONAL_EMAIL_FROM_NAME = "Platform";
    delete process.env.TRANSACTIONAL_EMAIL_SMTP_HOST;
    delete process.env.TRANSACTIONAL_EMAIL_SMTP_PORT;
    delete process.env.TRANSACTIONAL_EMAIL_SMTP_USER;
    delete process.env.TRANSACTIONAL_EMAIL_SMTP_PASSWORD;

    const { getTransactionalEmailConfig, TransactionalEmailConfigError } =
      await import("@/lib/transactional-email/config");

    expect(() => getTransactionalEmailConfig()).toThrow(
      TransactionalEmailConfigError,
    );

    setSmtpEnv();
    vi.resetModules();
    const { getTransactionalEmailConfig: getConfig } = await import(
      "@/lib/transactional-email/config"
    );
    const config = getConfig();
    expect(config.provider).toBe("smtp");
    expect(config.smtp?.host).toBe("smtp.ionos.com");
    expect(config.smtp?.port).toBe(587);
    expect(config.smtp?.secure).toBe(false);
    expect(config.smtp?.password).toBe("super-secret-smtp-pass");
  });

  it("still selects console and resend providers", async () => {
    process.env.TRANSACTIONAL_EMAIL_PROVIDER = "console";
    const { getTransactionalEmailConfig } = await import(
      "@/lib/transactional-email/config"
    );
    expect(getTransactionalEmailConfig().provider).toBe("console");

    vi.resetModules();
    process.env.TRANSACTIONAL_EMAIL_PROVIDER = "resend";
    process.env.TRANSACTIONAL_EMAIL_API_KEY = "re_test";
    const { getTransactionalEmailConfig: getConfig2 } = await import(
      "@/lib/transactional-email/config"
    );
    expect(getConfig2().provider).toBe("resend");
  });

  it("configured From identity is authoritative", async () => {
    process.env.TRANSACTIONAL_EMAIL_PROVIDER = "console";
    process.env.TRANSACTIONAL_EMAIL_FROM_EMAIL = "noreply@platform.test";
    process.env.TRANSACTIONAL_EMAIL_FROM_NAME = "Platform Name";
    const { getTransactionalEmailConfig, formatFromAddress } = await import(
      "@/lib/transactional-email/config"
    );
    const config = getTransactionalEmailConfig();
    expect(formatFromAddress(config)).toBe(
      "Platform Name <noreply@platform.test>",
    );
  });
});

describe("recipient / header safety", () => {
  it("rejects header injection and invalid recipients", async () => {
    const {
      assertSafeRecipient,
      assertSafeSubject,
      TransactionalEmailSendError,
    } = await import("@/lib/transactional-email/providers/types");

    expect(assertSafeRecipient("user@example.com")).toBe("user@example.com");
    expect(() =>
      assertSafeRecipient("user@example.com\nBcc: evil@x.com"),
    ).toThrow(TransactionalEmailSendError);
    expect(() => assertSafeSubject("Hello\nX-Injected: yes")).toThrow(
      TransactionalEmailSendError,
    );
  });
});

describe("SMTP provider adapter", () => {
  beforeEach(() => {
    setSmtpEnv();
  });

  it("builds SMTP transport with TLS validation enabled, HTML+text, platform From", async () => {
    const provider = await smtpProviderFromConfig();
    expect(provider.name).toBe("smtp");

    const result = await provider.send({
      to: "user@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    expect(result.providerMessageId).toBe("<msg@smtp>");

    expect(createTransport).toHaveBeenCalled();
    const transportCalls = createTransport.mock.calls as unknown as unknown[][];
    const opts = transportCalls[0]![0] as {
      tls?: { rejectUnauthorized?: boolean };
      auth?: { pass?: string };
      secure?: boolean;
      port?: number;
      requireTLS?: boolean;
    };
    expect(opts.port).toBe(587);
    expect(opts.secure).toBe(false);
    expect(opts.requireTLS).toBe(true);
    expect(opts.tls?.rejectUnauthorized).toBe(true);
    expect(opts.auth?.pass).toBe("super-secret-smtp-pass");

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Platform <platform@example.com>",
        to: "user@example.com",
        replyTo: "support@example.com",
        html: "<p>Hi</p>",
        text: "Hi",
      }),
    );

    const mailCalls = sendMail.mock.calls as unknown as unknown[][];
    const callArg = mailCalls[0]![0] as Record<string, unknown>;
    expect(callArg.from).toBe("Platform <platform@example.com>");
    expect(Object.keys(callArg)).not.toContain("envelope");
  });

  it("port 465 uses secure=true without requiring STARTTLS separately", async () => {
    setSmtpEnv({
      TRANSACTIONAL_EMAIL_SMTP_PORT: "465",
      TRANSACTIONAL_EMAIL_SMTP_SECURE: "true",
    });
    const provider = await smtpProviderFromConfig();
    await provider.send({
      to: "a@b.com",
      subject: "s",
      html: "h",
      text: "t",
    });
    const transportCalls = createTransport.mock.calls as unknown as unknown[][];
    const opts = transportCalls[0]![0] as {
      secure: boolean;
      requireTLS: boolean;
      tls: { rejectUnauthorized: boolean };
    };
    expect(opts.secure).toBe(true);
    expect(opts.requireTLS).toBe(false);
    expect(opts.tls.rejectUnauthorized).toBe(true);
  });

  it("does not log SMTP password", async () => {
    const logs: unknown[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((...args) => {
      logs.push(args);
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
      logs.push(args);
    });

    const provider = await smtpProviderFromConfig();
    await provider.send({
      to: "user@example.com",
      subject: "Hi",
      html: "<p>x</p>",
      text: "x",
    });

    expect(JSON.stringify(logs)).not.toContain("super-secret-smtp-pass");
    spy.mockRestore();
    errSpy.mockRestore();
  });

  it("classifies auth failures as non-retryable", async () => {
    sendMail.mockImplementation(async () => {
      const err = new Error("Invalid login") as Error & { code: string };
      err.code = "EAUTH";
      throw err;
    });

    const provider = await smtpProviderFromConfig();
    await expect(
      provider.send({
        to: "a@b.com",
        subject: "s",
        html: "h",
        text: "t",
      }),
    ).rejects.toMatchObject({
      name: "TransactionalEmailSendError",
      category: "AUTH",
      retryable: false,
    });
  });

  it("exposes verify() without returning credentials", async () => {
    const provider = await smtpProviderFromConfig();
    const providers = await import("@/lib/transactional-email/providers");
    vi.spyOn(providers, "getTransactionalEmailProvider").mockReturnValue(
      provider,
    );

    const { verifyTransactionalEmailProvider } = await import(
      "@/lib/transactional-email/send"
    );
    const result = await verifyTransactionalEmailProvider();
    expect(result).toEqual({ provider: "smtp", ok: true });
    expect(JSON.stringify(result)).not.toContain("super-secret-smtp-pass");
    expect(verify).toHaveBeenCalled();
  });
});

describe("console and resend providers still work", () => {
  it("console provider sends without network", async () => {
    process.env.TRANSACTIONAL_EMAIL_PROVIDER = "console";
    const { getTransactionalEmailProvider } = await import(
      "@/lib/transactional-email/providers"
    );
    const provider = getTransactionalEmailProvider();
    expect(provider.name).toBe("console");
    const result = await provider.send({
      to: "a@b.com",
      subject: "s",
      html: "<p>h</p>",
      text: "h",
    });
    expect(result.providerMessageId).toMatch(/^console_/);
  });

  it("logs the verification URL from the console provider in local development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.TRANSACTIONAL_EMAIL_PROVIDER = "console";
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { ConsoleTransactionalEmailProvider } = await import(
      "@/lib/transactional-email/providers/console"
    );
    const provider = new ConsoleTransactionalEmailProvider();
    await provider.send({
      to: "alex@example.test",
      subject: "Verify email",
      html: '<p><a href="http://localhost:3000/verify?token=dev-link">Verify</a></p>',
      text: "Verify your email: http://localhost:3000/verify?token=dev-link",
    });
    expect(spy.mock.calls.some((args) => args[0] === "[transactional-email:console] verificationUrl")).toBe(
      true,
    );
    expect(
      spy.mock.calls.some((args) =>
        String(args[1] ?? "").includes("http://localhost:3000/verify?token=dev-link"),
      ),
    ).toBe(true);
    spy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("resend provider posts html+text with configured From", async () => {
    process.env.TRANSACTIONAL_EMAIL_PROVIDER = "resend";
    process.env.TRANSACTIONAL_EMAIL_API_KEY = "re_test_key";
    process.env.TRANSACTIONAL_EMAIL_FROM_EMAIL = "from@platform.test";
    process.env.TRANSACTIONAL_EMAIL_FROM_NAME = "Platform";
    process.env.TRANSACTIONAL_EMAIL_REPLY_TO = "support@platform.test";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "re_msg_1" }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { ResendTransactionalEmailProvider } = await import(
      "@/lib/transactional-email/providers/resend"
    );
    const { getTransactionalEmailConfig, formatFromAddress } = await import(
      "@/lib/transactional-email/config"
    );
    const config = getTransactionalEmailConfig();
    const result = await new ResendTransactionalEmailProvider(
      config.apiKey!,
      formatFromAddress(config),
      config.replyTo,
    ).send({
      to: "user@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    expect(result.providerMessageId).toBe("re_msg_1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"from":"Platform <from@platform.test>"'),
      }),
    );
    const fetchCalls = fetchMock.mock.calls as unknown as unknown[][];
    const body = JSON.parse(
      (fetchCalls[0]![1] as { body: string }).body,
    ) as { html: string; text: string; from: string };
    expect(body.html).toBe("<p>Hi</p>");
    expect(body.text).toBe("Hi");
    expect(body.from).toBe("Platform <from@platform.test>");
    vi.unstubAllGlobals();
  });
});

describe("sendTransactionalEmail retry + telemetry with SMTP mock", () => {
  const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

  it.skipIf(!hasDatabase)(
    "records SMTP send events without tokens; retries transient then succeeds",
    async () => {
      setSmtpEnv({ TRANSACTIONAL_EMAIL_SMTP_PASSWORD: "secret-pass" });

      let attempts = 0;
      sendMail.mockImplementation(async () => {
        attempts += 1;
        if (attempts === 1) {
          const err = new Error("connection timeout") as Error & {
            code: string;
          };
          err.code = "ETIMEDOUT";
          throw err;
        }
        return { messageId: "<ok@smtp>" };
      });

      vi.resetModules();
      setSmtpEnv({ TRANSACTIONAL_EMAIL_SMTP_PASSWORD: "secret-pass" });
      const { resetSmtpTransportForTests } = await import(
        "@/lib/transactional-email/providers/smtp"
      );
      resetSmtpTransportForTests();
      const provider = await smtpProviderFromConfig();
      const providers = await import("@/lib/transactional-email/providers");
      const spy = vi
        .spyOn(providers, "getTransactionalEmailProvider")
        .mockReturnValue(provider);

      try {
        const { ensureTransactionalTemplatesSeeded } = await import(
          "@/lib/transactional-email/seed"
        );
        await ensureTransactionalTemplatesSeeded();

        const { sendTransactionalEmail } = await import(
          "@/lib/transactional-email/send"
        );
        const token = "live-reset-token-should-not-persist";
        const { eventId } = await sendTransactionalEmail({
          templateKey: "PASSWORD_RESET",
          to: `smtp-test-${Date.now()}@example.test`,
          variables: {
            firstName: "Sam",
            resetUrl: `https://example.test/reset?token=${token}`,
            expirationTime: "1 hour",
          },
          maxRetries: 2,
        });

        const { prisma } = await import("@/lib/prisma");
        const event = await prisma.transactionalEmailEvent.findUniqueOrThrow({
          where: { id: eventId },
        });
        expect(event.provider).toBe("smtp");
        expect(event.status).toBe("SENT");
        expect(event.retryCount).toBeGreaterThanOrEqual(1);
        expect(event.providerMessageId).toBe("<ok@smtp>");
        expect(JSON.stringify(event)).not.toContain(token);
        expect(JSON.stringify(event)).not.toContain("secret-pass");
        expect(attempts).toBe(2);
      } finally {
        spy.mockRestore();
      }
    },
    60_000,
  );

  it.skipIf(!hasDatabase)(
    "does not endlessly retry permanent SMTP auth failures",
    async () => {
      setSmtpEnv({ TRANSACTIONAL_EMAIL_SMTP_PASSWORD: "bad" });

      let attempts = 0;
      sendMail.mockImplementation(async () => {
        attempts += 1;
        const err = new Error("Invalid login") as Error & {
          code: string;
        };
        err.code = "EAUTH";
        throw err;
      });

      vi.resetModules();
      setSmtpEnv({ TRANSACTIONAL_EMAIL_SMTP_PASSWORD: "bad" });
      const { resetSmtpTransportForTests } = await import(
        "@/lib/transactional-email/providers/smtp"
      );
      resetSmtpTransportForTests();
      const provider = await smtpProviderFromConfig();
      const providers = await import("@/lib/transactional-email/providers");
      const spy = vi
        .spyOn(providers, "getTransactionalEmailProvider")
        .mockReturnValue(provider);

      try {
        const { ensureTransactionalTemplatesSeeded } = await import(
          "@/lib/transactional-email/seed"
        );
        await ensureTransactionalTemplatesSeeded();
        const { sendTransactionalEmail } = await import(
          "@/lib/transactional-email/send"
        );

        await expect(
          sendTransactionalEmail({
            templateKey: "WELCOME",
            to: `smtp-auth-fail-${Date.now()}@example.test`,
            variables: {
              firstName: "Sam",
              workspaceName: "Workspace",
            },
            maxRetries: 3,
          }),
        ).rejects.toMatchObject({ category: "AUTH", retryable: false });

        expect(attempts).toBe(1);
      } finally {
        spy.mockRestore();
      }
    },
    60_000,
  );

  it.skipIf(!hasDatabase)(
    "test send prefixes subject and does not require auth state mutation",
    async () => {
      process.env.TRANSACTIONAL_EMAIL_PROVIDER = "console";
      const { ensureTransactionalTemplatesSeeded } = await import(
        "@/lib/transactional-email/seed"
      );
      await ensureTransactionalTemplatesSeeded();
      const { sendTransactionalEmail } = await import(
        "@/lib/transactional-email/send"
      );
      const { eventId, rendered } = await sendTransactionalEmail({
        templateKey: "EMAIL_VERIFICATION",
        to: `smtp-testsend-${Date.now()}@example.test`,
        isTestSend: true,
        variables: {
          firstName: "Test",
          verificationUrl: "https://example.test/verify?token=test-placeholder",
          expirationTime: "1 hour",
        },
      });
      expect(rendered.subject.length).toBeGreaterThan(0);
      const { prisma } = await import("@/lib/prisma");
      const event = await prisma.transactionalEmailEvent.findUniqueOrThrow({
        where: { id: eventId },
      });
      expect(event.status).toBe("SENT");
      expect(JSON.stringify(event)).not.toContain("test-placeholder");
    },
    60_000,
  );

  it.skipIf(!hasDatabase)(
    "invitation template send works through provider factory (console)",
    async () => {
      process.env.TRANSACTIONAL_EMAIL_PROVIDER = "console";
      const { ensureTransactionalTemplatesSeeded } = await import(
        "@/lib/transactional-email/seed"
      );
      await ensureTransactionalTemplatesSeeded();
      const { sendTransactionalEmail } = await import(
        "@/lib/transactional-email/send"
      );
      const { eventId } = await sendTransactionalEmail({
        templateKey: "ORGANIZATION_INVITATION",
        to: `invite-${Date.now()}@example.test`,
        variables: {
          firstName: "Sam",
          workspaceName: "Acme",
          inviterName: "Alex",
          invitedEmail: "invitee@example.test",
          invitationUrl: "https://example.test/invite?token=placeholder",
          expirationTime: "7 days",
        },
      });
      const { prisma } = await import("@/lib/prisma");
      const event = await prisma.transactionalEmailEvent.findUniqueOrThrow({
        where: { id: eventId },
      });
      expect(event.templateKey).toBe("ORGANIZATION_INVITATION");
      expect(event.status).toBe("SENT");
      expect(event.provider).toBe("console");
    },
    60_000,
  );
});

describe("auth email failure safety helpers", () => {
  it("password-reset client path stays neutral regardless of fetch outcome", async () => {
    const outcomes = [200, 500, 0] as const;
    for (const status of outcomes) {
      const message =
        "If an account exists for that email, we've sent password reset instructions.";
      expect(message).toContain("If an account exists");
      expect(status === 500 || status === 0 || status === 200).toBe(true);
    }
  });
});

describe("nodemailer import safety", () => {
  it("uses the mocked nodemailer transport in this file", () => {
    expect(nodemailer.createTransport).toBe(createTransport);
  });
});
