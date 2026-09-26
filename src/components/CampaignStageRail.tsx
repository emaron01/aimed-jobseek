import Link from "next/link";
import type {
  CampaignStage,
  CampaignStageKey,
} from "@/lib/workflow/campaign-stages";
import { vocab } from "@/lib/product-config";

export function CampaignStageRail({
  campaignId,
  stages,
  currentStage,
}: {
  campaignId: string;
  stages: CampaignStage[];
  currentStage: CampaignStageKey;
}) {
  const currentNumber =
    stages.find((stage) => stage.key === currentStage)?.number ?? 4;
  return (
    <nav
      aria-label={`${vocab.campaign.Singular} workflow`}
      className="mb-6 overflow-x-auto rounded-xl border border-edge bg-surface p-2"
    >
      <ol className="flex min-w-max items-center gap-1">
        {stages.map((stage) => {
          const content = (
            <>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  stage.completed
                    ? "bg-success text-on-ink"
                    : currentStage === stage.key
                      ? "bg-ink text-on-ink"
                      : "bg-edge text-muted"
                }`}
              >
                {stage.completed ? "✓" : stage.number}
              </span>
              <span>{stage.label}</span>
            </>
          );
          return (
            <li key={stage.key}>
              {stage.available ? (
                <Link
                  href={`/campaigns/${campaignId}?stage=${stage.key}`}
                  aria-current={currentStage === stage.key ? "step" : undefined}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                    currentStage === stage.key
                      ? "bg-canvas text-ink"
                      : stage.number > currentNumber
                        ? "text-subtle hover:bg-canvas hover:text-muted"
                        : "text-ink hover:bg-canvas"
                  }`}
                >
                  {content}
                </Link>
              ) : (
                <span
                  title={stage.unavailableReason ?? undefined}
                  aria-disabled="true"
                  className="flex cursor-not-allowed items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-subtle"
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
