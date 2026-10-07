import { requirePlatformSuperAdmin } from "@/lib/auth/authz";
import {
  getHarperDraftSettings,
  HARPER_DRAFT_SETTINGS_KEY,
} from "@/lib/consultation/harper-draft-settings";
import { hasPlatformSetting } from "@/lib/platform/settings";
import { HarperDraftSettingsForm } from "@/components/platform/HarperDraftSettingsForm";

export default async function PlatformHarperPage() {
  await requirePlatformSuperAdmin();
  const [settings, hasConsoleRow] = await Promise.all([
    getHarperDraftSettings(),
    hasPlatformSetting(HARPER_DRAFT_SETTINGS_KEY),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Harper drafts</h1>
        <p className="mt-1 text-sm text-muted">
          Best-practice question count, the overall question limit, spoken-answer
          length targets, and resume bullet bands. Stored in platform settings.
          Changing them does not call a model.
        </p>
      </div>
      <HarperDraftSettingsForm settings={settings} hasConsoleRow={hasConsoleRow} />
    </div>
  );
}
