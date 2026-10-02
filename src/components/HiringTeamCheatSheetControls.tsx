import {
  addPersonaToCheatSheetAction,
  removePersonaFromCheatSheetAction,
} from "@/app/actions/hiring-team";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { hiringTeamConfig } from "@/lib/product-config";

export function HiringTeamRecommendedLine() {
  return (
    <p className="text-sm text-ink" data-testid="hiring-team-recommended-line">
      {hiringTeamConfig.recommendedLine}
    </p>
  );
}

export function HiringTeamRecommendedMark({ personaId }: { personaId: string }) {
  return (
    <span
      className="text-xs text-subtle"
      data-testid={`hiring-team-recommended-${personaId}`}
    >
      {hiringTeamConfig.recommendedMark}
    </span>
  );
}

export function HiringTeamCheatSheetToggle({
  campaignId,
  personaId,
  added,
}: {
  campaignId: string;
  personaId: string;
  added: boolean;
}) {
  return (
    <ApplicationActionForm
      action={added ? removePersonaFromCheatSheetAction : addPersonaToCheatSheetAction}
      submitLabel={
        added
          ? hiringTeamConfig.actions.removeFromCheatSheet
          : hiringTeamConfig.actions.addToCheatSheet
      }
      variant="secondary"
      testId={added ? `remove-cheat-sheet-${personaId}` : `add-cheat-sheet-${personaId}`}
      formClassName="print:hidden"
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="personaId" value={personaId} />
    </ApplicationActionForm>
  );
}
