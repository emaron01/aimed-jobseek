"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateCampaignEmailSettingsAction } from "@/app/actions/campaign-email-settings";
import {
  EMAIL_GUIDANCE_MAX_CHARS,
  EMAIL_LENGTH_OPTIONS,
  emailLengthLabel,
  type CampaignEmailLength,
  type CampaignEmailSettingsActionResult,
} from "@/lib/campaign/save";
import { SubmitButton } from "@/components/ui";
import { EmailGuidancePromptExamples } from "@/components/EmailGuidancePromptExamples";
import { vocab } from "@/lib/product-config";

const initial: CampaignEmailSettingsActionResult | null = null;

export function CampaignEmailSettingsForm({
  campaignId,
  emailLength,
  emailGuidance,
}: {
  campaignId: string;
  emailLength: CampaignEmailLength;
  emailGuidance: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateCampaignEmailSettingsAction,
    initial,
  );
  const displayedLength = state?.values?.emailLength ?? emailLength;
  const displayedGuidance = state?.values?.emailGuidance ?? emailGuidance ?? "";

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />

      {state ? (
        <p
          role="status"
          data-testid="campaign-email-settings-status"
          className={
            state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      ) : null}

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">
          Default email length
        </legend>
        <p className="mt-1 text-xs text-slate-500">
          Used for new drafts. Override length on each email.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          {EMAIL_LENGTH_OPTIONS.map((value) => (
            <label
              key={value}
              className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <input
                type="radio"
                name="emailLength"
                value={value}
                defaultChecked={displayedLength === value}
              />
              {emailLengthLabel(value)}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Email guidance</span>
          <span className="mt-1 block text-xs text-slate-500">
            Steers every generated email in this {vocab.campaign.singular}, up to{" "}
            {EMAIL_GUIDANCE_MAX_CHARS} characters.
          </span>
          <textarea
            name="emailGuidance"
            rows={4}
            maxLength={EMAIL_GUIDANCE_MAX_CHARS}
            defaultValue={displayedGuidance}
            placeholder="Focus on the feature that removes the most manual work"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2"
          />
        </label>
        <EmailGuidancePromptExamples />
      </div>

      <SubmitButton disabled={pending}>
        {pending ? "Saving…" : "Save email settings"}
      </SubmitButton>
    </form>
  );
}
