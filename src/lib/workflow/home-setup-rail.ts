/**
 * Home setup orientation rail — same green-check pattern as campaign stages.
 * Pure display helpers; no writes.
 */

import { VOICE_SAMPLE_READY_MIN, voiceReadiness } from "@/lib/voice/types";
import {
  PRODUCT_READINESS_BLOCKERS,
  type ProductCampaignReadiness,
} from "@/lib/workflow/product-campaign-readiness";
import { anyListFeatureEnabled, countedNoun, vocab } from "@/lib/product-config";

export const HOME_SETUP_STEP_KEYS = [
  "voice",
  "products",
  "lists",
  "contacts",
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
};

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function shortProductGap(readiness: ProductCampaignReadiness): string {
  const blocker = readiness.blockers[0] ?? "needs setup";
  if (blocker === PRODUCT_READINESS_BLOCKERS.needsIcp) return `needs ${vocab.icp.aSingular}`;
  if (blocker === PRODUCT_READINESS_BLOCKERS.needsPersona) return `needs ${vocab.persona.aSingular}`;
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

function productsDetail(input: {
  total: number;
  readyCount: number;
  incomplete: ProductCampaignReadiness[];
}): string {
  const { total, readyCount, incomplete } = input;
  if (total === 0) return `No ${vocab.product.plural} yet`;

  const productWord = countedNoun(total, vocab.product);
  if (incomplete.length === 0) {
    return readyCount === 1 ? `1 ${vocab.product.singular} ready` : `${readyCount} ${vocab.product.plural} ready`;
  }

  // Group identical gaps: "1 needs a persona", "2 need an ICP"
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
  /** Same readiness as New campaign: approved + ICP with criteria + persona. */
  productReadyCount: number;
  productIncomplete: ProductCampaignReadiness[];
  listCount: number;
  contactCount: number;
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
      key: "voice",
      label: "Voice",
      href: "/settings/voice",
      completed: input.voice.ready,
      detail: voiceDetail,
    },
    {
      number: 2,
      key: "products",
      label: vocab.product.Plural,
      href: "/products",
      completed: input.productReadyCount > 0,
      detail: productsDetail({
        total: input.productTotal,
        readyCount: input.productReadyCount,
        incomplete: input.productIncomplete,
      }),
    },
    {
      number: 3,
      key: "lists",
      label: vocab.list.Plural,
      href: "/lists",
      completed: input.listCount > 0,
      detail:
        input.listCount === 0
          ? `No ${vocab.list.plural} yet`
          : countedNoun(input.listCount, vocab.list),
    },
    {
      number: 4,
      key: "contacts",
      label: vocab.contact.Plural,
      href: "/contacts",
      completed: input.contactCount > 0,
      detail:
        input.contactCount === 0
          ? `No ${vocab.contact.plural} yet`
          : countedNoun(input.contactCount, vocab.contact),
    },
    {
      number: 5,
      key: "email",
      label: "Email connection",
      href: "/settings/email",
      completed: input.emailConnected,
      detail: emailDetail,
    },
  ];
  const visible = anyListFeatureEnabled()
    ? steps
    : steps.filter((step) => step.key !== "lists");
  return visible.map((step, index) => ({ ...step, number: index + 1 }));
}

/** First incomplete step, or the last step when everything is green. */
export function resolveHomeSetupFocus(
  steps: HomeSetupStep[],
): HomeSetupStepKey {
  return (
    steps.find((step) => !step.completed)?.key ??
    steps.at(-1)?.key ??
    "voice"
  );
}
