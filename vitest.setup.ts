/**
 * Global Vitest setup — runs before any test file.
 *
 * Tests never load `.env.local`. Database URL comes from TEST_DATABASE_URL
 * (`.env.test` / `.env.test.example` / docker-compose). A production host
 * hard-fails unless ALLOW_PROD_DB_TESTS=1.
 *
 * Mail: force console provider, strip live credentials, mock nodemailer.
 */
import { vi } from "vitest";
import { configureVitestDatabase } from "./src/test/database";

configureVitestDatabase();

process.env.TRANSACTIONAL_EMAIL_PROVIDER = "console";

if (!process.env.APP_URL?.trim()) {
  process.env.APP_URL = "http://localhost:3000";
}
if (!process.env.NEXT_PUBLIC_APP_URL?.trim()) {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
}
if (!process.env.MARKETING_URL?.trim()) {
  process.env.MARKETING_URL = "https://aimedjobseek.example";
}
if (!process.env.SUPPORT_EMAIL?.trim()) {
  process.env.SUPPORT_EMAIL = "support@example.test";
}

const TRANSACTIONAL_EMAIL_SECRET_KEYS = [
  "TRANSACTIONAL_EMAIL_ALLOW_LIVE_SMTP_IN_TESTS",
  "TRANSACTIONAL_EMAIL_API_KEY",
  "TRANSACTIONAL_EMAIL_SMTP_HOST",
  "TRANSACTIONAL_EMAIL_SMTP_PORT",
  "TRANSACTIONAL_EMAIL_SMTP_SECURE",
  "TRANSACTIONAL_EMAIL_SMTP_USER",
  "TRANSACTIONAL_EMAIL_SMTP_PASSWORD",
] as const;

for (const key of TRANSACTIONAL_EMAIL_SECRET_KEYS) {
  delete process.env[key];
}

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn(async () => {
        throw new Error(
          "nodemailer.createTransport was called without a per-test mock. " +
            "Live SMTP is blocked in Vitest — mock nodemailer in the test file.",
        );
      }),
      verify: vi.fn(async () => {
        throw new Error(
          "nodemailer verify blocked in Vitest without a per-test mock.",
        );
      }),
      close: vi.fn(),
    })),
  },
}));
