import { hiringTeamConfig } from "@/lib/product-config";

export function HiringTeamAssumptionNotice() {
  return (
    <p
      role="note"
      data-testid="hiring-team-assumption-notice"
      className="rounded-md border border-warning bg-warning-tint px-4 py-3 text-sm font-bold text-warning"
    >
      {hiringTeamConfig.assumptionIntro}
    </p>
  );
}
