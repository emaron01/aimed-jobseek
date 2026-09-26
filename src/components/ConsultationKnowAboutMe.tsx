"use client";

import { useState } from "react";
import { saveWhatYouShouldKnowAboutMeAction } from "@/app/actions/consultation";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { AppButton } from "@/components/AppButton";
import { consultationConversationCopy } from "@/lib/product-config";

export function ConsultationKnowAboutMe({
  campaignId,
  initialText,
}: {
  campaignId: string;
  initialText: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialText);

  return (
    <div className="space-y-3" data-testid="know-about-me">
      <AppButton
        type="button"
        variant="secondary"
        onClick={() => setOpen((current) => !current)}
      >
        {consultationConversationCopy.knowAboutMe}
      </AppButton>
      {open ? (
        <div className="space-y-3 rounded-md border border-edge bg-canvas p-4">
          <p className="text-sm text-muted">
            {consultationConversationCopy.knowAboutMeHelp}
          </p>
          <ApplicationActionForm
            action={saveWhatYouShouldKnowAboutMeAction}
            submitLabel={consultationConversationCopy.knowAboutMeSave}
            testId="save-know-about-me"
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <label className="block text-sm">
              <span className="sr-only">
                {consultationConversationCopy.knowAboutMe}
              </span>
              <textarea
                name="background"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                maxLength={consultationConversationCopy.knowAboutMeMaxChars}
                rows={6}
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
                required
              />
            </label>
          </ApplicationActionForm>
        </div>
      ) : null}
    </div>
  );
}
