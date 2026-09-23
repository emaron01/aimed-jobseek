import { brand } from "@/lib/product-config";
import { getBrandDeployment } from "@/lib/product-config/deployment";

/**
 * Node-safe transactional email config (no server-only).
 * Next.js entry: `@/lib/transactional-email/config` re-exports behind server-only.
 */

export type TransactionalEmailProviderName = "console" | "resend" | "smtp";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  /** Connection/socket timeout in milliseconds. */
  timeoutMs: number;
};

export type TransactionalEmailConfig = {
  provider: TransactionalEmailProviderName;
  apiKey: string | null;
  fromEmail: string;
  fromName: string;
  replyTo: string | null;
  supportEmail: string;
  smtp: SmtpConfig | null;
};

export class TransactionalEmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionalEmailConfigError";
  }
}

/**
 * Parse env boolean without JS truthiness traps ("false" must be false).
 */
export function parseEnvBoolean(
  value: string | undefined,
  label: string,
): boolean {
  const raw = value?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no" || raw === "") return false;
  if (raw == null) return false;
  throw new TransactionalEmailConfigError(
    `${label} must be true or false (got "${value}").`,
  );
}

/**
 * Parse SMTP port as integer in valid range.
 */
export function parseSmtpPort(value: string | undefined): number {
  const raw = value?.trim();
  if (!raw) {
    throw new TransactionalEmailConfigError(
      "TRANSACTIONAL_EMAIL_SMTP_PORT is required when provider=smtp.",
    );
  }
  if (!/^\d+$/.test(raw)) {
    throw new TransactionalEmailConfigError(
      `TRANSACTIONAL_EMAIL_SMTP_PORT must be a numeric port (got "${value}").`,
    );
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TransactionalEmailConfigError(
      `TRANSACTIONAL_EMAIL_SMTP_PORT must be between 1 and 65535 (got "${value}").`,
    );
  }
  return port;
}

function parseTimeoutMs(value: string | undefined): number {
  const raw = value?.trim();
  if (!raw) return 15_000;
  if (!/^\d+$/.test(raw)) {
    throw new TransactionalEmailConfigError(
      "TRANSACTIONAL_EMAIL_SMTP_TIMEOUT_MS must be a positive integer.",
    );
  }
  const ms = Number(raw);
  if (!Number.isInteger(ms) || ms < 1_000 || ms > 120_000) {
    throw new TransactionalEmailConfigError(
      "TRANSACTIONAL_EMAIL_SMTP_TIMEOUT_MS must be between 1000 and 120000.",
    );
  }
  return ms;
}

function requireNonEmpty(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new TransactionalEmailConfigError(`${label} is required.`);
  }
  return trimmed;
}

/**
 * Central transactional-email configuration.
 * All env reads for this subsystem happen here.
 */
export function getTransactionalEmailConfig(): TransactionalEmailConfig {
  const providerRaw =
    process.env.TRANSACTIONAL_EMAIL_PROVIDER?.trim().toLowerCase() ||
    "console";

  let provider: TransactionalEmailProviderName;
  if (providerRaw === "smtp") provider = "smtp";
  else if (providerRaw === "resend") provider = "resend";
  else if (providerRaw === "console") provider = "console";
  else {
    throw new TransactionalEmailConfigError(
      `Unknown TRANSACTIONAL_EMAIL_PROVIDER "${providerRaw}". Use console, smtp, or resend.`,
    );
  }

  const apiKey = process.env.TRANSACTIONAL_EMAIL_API_KEY?.trim() || null;
  const fromEmail =
    process.env.TRANSACTIONAL_EMAIL_FROM_EMAIL?.trim() ||
    "noreply@localhost";
  const fromName =
    process.env.TRANSACTIONAL_EMAIL_FROM_NAME?.trim() ||
    brand.transactionalSenderName;
  const replyTo =
    process.env.TRANSACTIONAL_EMAIL_REPLY_TO?.trim() || null;
  const supportEmail = getBrandDeployment().supportEmail;

  if (provider === "resend" && !apiKey) {
    throw new TransactionalEmailConfigError(
      "TRANSACTIONAL_EMAIL_API_KEY is required when TRANSACTIONAL_EMAIL_PROVIDER=resend.",
    );
  }

  let smtp: SmtpConfig | null = null;
  if (provider === "smtp") {
    smtp = {
      host: requireNonEmpty(
        process.env.TRANSACTIONAL_EMAIL_SMTP_HOST,
        "TRANSACTIONAL_EMAIL_SMTP_HOST",
      ),
      port: parseSmtpPort(process.env.TRANSACTIONAL_EMAIL_SMTP_PORT),
      secure: parseEnvBoolean(
        process.env.TRANSACTIONAL_EMAIL_SMTP_SECURE,
        "TRANSACTIONAL_EMAIL_SMTP_SECURE",
      ),
      user: requireNonEmpty(
        process.env.TRANSACTIONAL_EMAIL_SMTP_USER,
        "TRANSACTIONAL_EMAIL_SMTP_USER",
      ),
      password: requireNonEmpty(
        process.env.TRANSACTIONAL_EMAIL_SMTP_PASSWORD,
        "TRANSACTIONAL_EMAIL_SMTP_PASSWORD",
      ),
      timeoutMs: parseTimeoutMs(
        process.env.TRANSACTIONAL_EMAIL_SMTP_TIMEOUT_MS,
      ),
    };
  }

  return {
    provider,
    apiKey,
    fromEmail,
    fromName,
    replyTo,
    supportEmail,
    smtp,
  };
}

/** Format platform From identity from trusted server config only. */
export function formatFromAddress(config: TransactionalEmailConfig): string {
  return `${config.fromName} <${config.fromEmail}>`;
}
