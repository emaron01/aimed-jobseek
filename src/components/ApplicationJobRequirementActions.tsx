"use client";

import { useState } from "react";
import {
  regenerateApplicationJobRequirementAction,
  saveApplicationJobLearnedNotesAction,
  saveApplicationJobPostingAction,
} from "@/app/actions/application";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import {
  applicationWorkspaceCopy,
  consultationConfig,
  polishCopy,
  vocab,
} from "@/lib/product-config";
import { JOB_LEARNED_NOTES_MAX_CHARS } from "@/lib/research/seeker-supplied-notes";

const fieldClass =
  "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";

function withConsultant(text: string): string {
  return text
    .replaceAll("{consultant}", consultationConfig.displayName)
    .replaceAll("{product}", vocab.product.Singular);
}

export function ApplicationJobRequirementActions({
  campaignId,
  rawText,
  learnedNotes,
}: {
  campaignId: string;
  rawText: string;
  learnedNotes: string;
}) {
  const [notesValue, setNotesValue] = useState(learnedNotes);
  const [postingValue, setPostingValue] = useState(rawText);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <details
          className="w-full rounded-md border border-edge bg-canvas p-4"
          data-testid="edit-job-posting"
        >
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            {applicationWorkspaceCopy.jobEditTitle}
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-sm text-muted">
              {applicationWorkspaceCopy.jobEditHelp}
            </p>
            <ApplicationActionForm
              action={saveApplicationJobPostingAction}
              submitLabel={applicationWorkspaceCopy.jobEditSave}
              testId="save-job-posting"
            >
              <input type="hidden" name="campaignId" value={campaignId} />
              <label className="block text-sm">
                <span className="sr-only">
                  {applicationWorkspaceCopy.jobEditTitle}
                </span>
                <textarea
                  name="postingText"
                  value={postingValue}
                  onChange={(event) => setPostingValue(event.target.value)}
                  rows={12}
                  className={fieldClass}
                  required
                />
              </label>
            </ApplicationActionForm>
          </div>
        </details>
        <ApplicationActionForm
          action={regenerateApplicationJobRequirementAction}
          submitLabel={polishCopy.regenerate}
          testId="regenerate-job-requirement"
        >
          <input type="hidden" name="campaignId" value={campaignId} />
        </ApplicationActionForm>
      </div>
      <details
        className="rounded-md border border-edge bg-canvas p-4"
        data-testid="job-learned-notes"
      >
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          {applicationWorkspaceCopy.jobLearnedTitle}
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">
            {withConsultant(applicationWorkspaceCopy.jobLearnedHelp)}
          </p>
          <ApplicationActionForm
            action={saveApplicationJobLearnedNotesAction}
            submitLabel={applicationWorkspaceCopy.jobLearnedSave}
            testId="save-job-learned-notes"
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <label className="block text-sm">
              <span className="sr-only">
                {applicationWorkspaceCopy.jobLearnedTitle}
              </span>
              <textarea
                name="notes"
                value={notesValue}
                onChange={(event) => setNotesValue(event.target.value)}
                maxLength={JOB_LEARNED_NOTES_MAX_CHARS}
                rows={6}
                className={fieldClass}
              />
            </label>
          </ApplicationActionForm>
        </div>
      </details>
    </div>
  );
}
