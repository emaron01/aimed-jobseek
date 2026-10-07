"use client";

import { useActionState } from "react";
import {
  updateHarperDraftSettingsAction,
  type PlatformSettingsActionResult,
} from "@/app/actions/platform-settings";
import type { HarperDraftSettings } from "@/lib/consultation/harper-draft-settings";
import { applicationAssetConfig } from "@/lib/product-config";

const initial: PlatformSettingsActionResult | null = null;

const FIELDS: Array<{ key: keyof HarperDraftSettings; label: string }> = [
  { key: "bestPracticeCount", label: "Best-practice question count" },
  { key: "questionLimit", label: "Overall question limit" },
  { key: "gapWords", label: "Gap answer words" },
  { key: "bestPracticeWords", label: "Best-practice answer words" },
  { key: "whyThisCompanyWords", label: "Why this company words" },
  { key: "walkThroughWordsPerRole", label: "Career walk-through words per recent role" },
  { key: "walkThroughWordsTotal", label: "Career walk-through words in total" },
  { key: "resumeBulletWords", label: "Resume bullet words" },
];

const bands = applicationAssetConfig.harperBulletBands;
const BULLET_FIELDS: Array<{ key: keyof HarperDraftSettings; label: string }> = [
  { key: "recentRoleYears", label: bands.recentRoleYears },
  { key: "midRoleYears", label: bands.midRoleYears },
  { key: "olderRoleYears", label: bands.olderRoleYears },
  { key: "recentBulletMin", label: bands.recentBulletMin },
  { key: "recentBulletMax", label: bands.recentBulletMax },
  { key: "recentPrimaryBulletMax", label: bands.recentPrimaryBulletMax },
  { key: "midBulletMin", label: bands.midBulletMin },
  { key: "midBulletMax", label: bands.midBulletMax },
  { key: "olderBulletMin", label: bands.olderBulletMin },
  { key: "olderBulletMax", label: bands.olderBulletMax },
  { key: "oldestRelevantBulletMin", label: bands.oldestRelevantBulletMin },
  { key: "oldestRelevantBulletMax", label: bands.oldestRelevantBulletMax },
];

export function HarperDraftSettingsForm({
  settings,
  hasConsoleRow,
}: {
  settings: HarperDraftSettings;
  hasConsoleRow: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateHarperDraftSettingsAction,
    initial,
  );

  return (
    <form action={formAction} className="space-y-4" data-testid="harper-draft-settings">
      <p className="text-xs text-subtle">
        {hasConsoleRow
          ? "A console row is saved. Harper reads it the next time it plans or drafts. Saving does not start a run."
          : "No console row yet. Harper is using the defaults below. Saving does not start a run."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label key={field.key} className="block text-sm text-ink">
            <span className="mb-1 block font-medium">{field.label}</span>
            <input
              name={field.key}
              type="number"
              min={0}
              required
              defaultValue={settings[field.key]}
              className="w-full rounded-md border border-edge bg-canvas px-3 py-2 text-sm text-ink"
            />
          </label>
        ))}
      </div>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">{bands.heading}</h2>
        <p className="text-xs text-subtle">{bands.help}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {BULLET_FIELDS.map((field) => (
            <label key={field.key} className="block text-sm text-ink">
              <span className="mb-1 block font-medium">{field.label}</span>
              <input
                name={field.key}
                type="number"
                min={0}
                required
                defaultValue={settings[field.key]}
                className="w-full rounded-md border border-edge bg-canvas px-3 py-2 text-sm text-ink"
              />
            </label>
          ))}
        </div>
      </div>
      {state ? (
        <p className={state.ok ? "text-sm text-success" : "text-sm text-danger"} role="status">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-on-ink disabled:opacity-60"
        >
          Save Harper settings
        </button>
        <button
          type="submit"
          name="intent"
          value="clear"
          disabled={pending}
          className="rounded-md border border-edge bg-canvas px-3 py-2 text-sm font-medium text-ink disabled:opacity-60"
        >
          Use defaults
        </button>
      </div>
    </form>
  );
}
