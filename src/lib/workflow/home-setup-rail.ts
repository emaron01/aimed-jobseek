/**
 * Home setup orientation rail — same green-check pattern as campaign stages.
 * Pure display helpers; no writes.
 */

import { VOICE_SAMPLE_READY_MIN, voiceReadiness } from "@/lib/voice/types";
import {
  PRODUCT_READINESS_BLOCKERS,
  type ProductCampaignReadiness,
} from "@/lib/workflow/product-campaign-readiness";
import { countedNoun, features, vocab } from "@/lib/product-config";

export const HOME_SETUP_STEP_KEYS = [
  "products",
  "voice",
  "icps",
  "email",
] as const;

export type HomeSetupStepKey = (typeof HOME_SETUP_STEP_KEYS)[number];

export type HomeSetupStep = {
  number: number;
  key: HomeSetupStepKey;
  label: string;
  href: string;
  completed: boolean;
  /** Count or connection status for the step (shown next to the label). */
  detail: string;
  optional?: boolean;
};

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function shortProductGap(readiness: ProductCampaignReadiness): string {
  const blocker = readiness.blockers[0] ?? "needs setup";
  if (blocker === PRODUCT_READINESS_BLOCKERS.needsIcp) return `needs ${vocab.icp.aSingular}`;
  if (
    blocker === PRODUCT_READINESS_BLOCKERS.needsReview ||
    blocker === PRODUCT_READINESS_BLOCKERS.draft ||
    blocker === PRODUCT_READINESS_BLOCKERS.notApproved
  ) {
    return "needs approval";
  }
  if (blocker === PRODUCT_READINESS_BLOCKERS.notStarted) return `needs ${vocab.product.singular} setup`;
  return "needs setup";
}

function isProfileApprovalGap(readiness: ProductCampaignReadiness): boolean {
  return readiness.blockers.some(
    (blocker) =>
      blocker === PRODUCT_READINESS_BLOCKERS.needsReview ||
      blocker === PRODUCT_READINESS_BLOCKERS.draft ||
      blocker === PRODUCT_READINESS_BLOCKERS.notApproved ||
      blocker === PRODUCT_READINESS_BLOCKERS.notStarted,
  );
}

function productsDetail(input: {
  total: number;
  readyCount: number;
  incomplete: ProductCampaignReadiness[];
}): string {
  const { total, readyCount } = input;
  const incomplete = input.incomplete.filter(isProfileApprovalGap);
  if (total === 0) return `No ${vocab.product.plural} yet`;

  const productWord = countedNoun(total, vocab.product);
  if (incomplete.length === 0) {
    return readyCount === 1 ? `1 ${vocab.product.singular} ready` : `${readyCount} ${vocab.product.plural} ready`;
  }

  // Group identical gaps: "1 needs approval", "2 need a Target Employer profile"
  const gapCounts = new Map<string, number>();
  for (const readiness of incomplete) {
    const gap = shortProductGap(readiness);
    gapCounts.set(gap, (gapCounts.get(gap) ?? 0) + 1);
  }
  const gapText = [...gapCounts.entries()]
    .map(([gap, count]) => {
      const verb = gap.startsWith("needs")
        ? count === 1
          ? gap
          : gap.replace(/^needs /, "need ")
        : gap;
      return `${count} ${verb}`;
    })
    .join(" · ");

  return `${productWord} · ${gapText}`;
}

export function buildHomeSetupRail(input: {
  voice: ReturnType<typeof voiceReadiness>;
  productTotal: number;
  /** Approved profiles — Target Employers is a separate rail step. */
  productApprovedCount: number;
  productIncomplete: ProductCampaignReadiness[];
  icpCount: number;
  emailConnected: boolean;
  emailReconnectRequired: boolean;
}): HomeSetupStep[] {
  const voiceDetail =
    input.voice.count === 0
      ? "No samples yet"
      : input.voice.ready
        ? `${input.voice.count} ${plural(input.voice.count, "sample")}`
        : `${input.voice.count} of ${VOICE_SAMPLE_READY_MIN} samples`;

  const emailDetail = input.emailConnected
    ? "Connected"
    : input.emailReconnectRequired
      ? "Reconnect required"
      : "Not connected";

  const steps: HomeSetupStep[] = [
    {
      number: 1,
      key: "products",
      label: vocab.product.Plural,
      href: "/products",
      completed: input.productApprovedCount > 0,
      detail: productsDetail({
        total: input.productTotal,
        readyCount: input.productApprovedCount,
        incomplete: input.productIncomplete,
      }),
    },
    {
      number: 2,
      key: "voice",
      label: "Voice",
      href: "/settings/voice",
      completed: input.voice.ready,
      detail: input.voice.ready ? voiceDetail : `${voiceDetail} · Optional`,
      optional: true,
    },
    {
      number: 3,
      key: "icps",
      label: vocab.icp.nav,
      href: "/icps",
      completed: input.icpCount > 0,
      detail:
        input.icpCount === 0
          ? `No ${vocab.icp.plural} yet`
          : countedNoun(input.icpCount, vocab.icp),
    },
    ...(features.emailConnection
      ? [
          {
            number: 4,
            key: "email" as const,
            label: "Email connection",
            href: "/settings/email",
            completed: input.emailConnected,
            detail: emailDetail,
          },
        ]
      : []),
  ];
  return steps;
}

/** First incomplete step, or the last step when everything is green. */
export function resolveHomeSetupFocus(
  steps: HomeSetupStep[],
): HomeSetupStepKey {
  return (
    steps.find((step) => !step.completed && !step.optional)?.key ??
    steps.find((step) => !step.completed)?.key ??
    steps.at(-1)?.key ??
    "products"
  );
}
