/**
 * Cookie read/write for pending self-serve signup intent.
 * No `server-only`: Better Auth (CLI-safe graph) dynamically imports this.
 *
 * Cookie read must succeed during HTTP signup so Team seats / company name apply.
 * Outside a Next request (smoke seed, CLI), set ALLOW_PENDING_SIGNUP_INTENT_SKIP=1
 * (or run under platform SUPER_ADMIN provisioning) to return a null intent
 * without calling cookies() — never silently default in production signup.
 */

import { cookies } from "next/headers";
import { isPlatformSuperAdminProvisioningActive } from "@/lib/auth/platform-provision-flag";
import { BILLING_PLAN_STANDARD } from "@/lib/billing/plans";
import {
  buildPendingSignupIntent,
  parsePendingSignupIntent,
  PENDING_SIGNUP_COOKIE,
  type PendingSignupIntent,
} from "@/lib/billing/pending-signup-intent";
import { defaultSeatQuantityForPlan } from "@/lib/org/seat-limits";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export class PendingSignupIntentCookieError extends Error {
  readonly code = "PENDING_SIGNUP_INTENT_COOKIE";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PendingSignupIntentCookieError";
  }
}

function allowIntentSkipOutsideRequest(): boolean {
  return process.env.ALLOW_PENDING_SIGNUP_INTENT_SKIP === "1";
}

export async function readPendingSignupIntent(): Promise<PendingSignupIntent | null> {
  // Never call cookies() outside a request — Next logs
  // "cookies was called outside a request scope" before throwing.
  if (
    allowIntentSkipOutsideRequest() ||
    isPlatformSuperAdminProvisioningActive()
  ) {
    return null;
  }

  let jar: Awaited<ReturnType<typeof cookies>>;
  try {
    jar = await cookies();
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.slice(0, 300) : "unknown";
    throw new PendingSignupIntentCookieError(
      `Pending signup plan cookie could not be read (${detail}). Team/Standard seat count and company name cannot be applied — sign up again from /signup/plan in the browser so the cookie is available during account creation.`,
      { cause: error },
    );
  }

  const raw = jar.get(PENDING_SIGNUP_COOKIE)?.value;
  if (!raw) return null;
  try {
    return parsePendingSignupIntent(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writePendingSignupIntent(
  intent: PendingSignupIntent,
): Promise<void> {
  const jar = await cookies();
  jar.set(PENDING_SIGNUP_COOKIE, JSON.stringify(intent), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SEC,
  });
}

export async function clearPendingSignupIntent(): Promise<void> {
  const jar = await cookies();
  jar.delete(PENDING_SIGNUP_COOKIE);
}

export async function mergePendingSignupIntent(
  patch: Partial<PendingSignupIntent> & { planCode?: string },
): Promise<PendingSignupIntent | null> {
  const existing = await readPendingSignupIntent();
  const planCode =
    patch.planCode === BILLING_PLAN_STANDARD || patch.planCode === "TEAM"
      ? patch.planCode
      : existing?.planCode;
  if (!planCode) return null;
  const seatQuantity =
    patch.seatQuantity ??
    existing?.seatQuantity ??
    defaultSeatQuantityForPlan(planCode);
  const companyName =
    patch.companyName !== undefined
      ? patch.companyName
      : existing?.companyName;
  const intent = buildPendingSignupIntent({
    planCode,
    seatQuantity,
    companyName,
  });
  if (!intent) return null;
  await writePendingSignupIntent(intent);
  return intent;
}
