import Link from "next/link";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";

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
  const className = cn(PRIMARY_BUTTON_CLASS, "mt-3");
  const isHash = href.startsWith("#");

  return (
    <div
      className="rounded-md border border-edge-strong bg-canvas px-4 py-3"
      data-testid="campaign-stage-next-step"
    >
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
      {isHash ? (
        <a href={href} className={className}>
          {label}
        </a>
      ) : (
        <Link href={href} className={className}>
          {label}
        </Link>
      )}
    </div>
  );
}
