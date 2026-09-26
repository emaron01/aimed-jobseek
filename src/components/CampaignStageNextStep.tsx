import { AppActionLink } from "@/components/ui";

/**
 * Plain-language next action for a campaign stage (Home setup rail pattern).
 */
export function CampaignStageNextStep({
  title,
  body,
  href,
  label,
}: {
  title: string;
  body: string;
  href: string;
  label: string;
}) {
  return (
    <div
      className="rounded-md border border-edge-strong bg-canvas px-4 py-3"
      data-testid="campaign-stage-next-step"
    >
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
      <AppActionLink href={href} variant="primary" className="mt-3">
        {label}
      </AppActionLink>
    </div>
  );
}
