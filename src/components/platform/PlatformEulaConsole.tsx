"use client";

import { useActionState, useState } from "react";
import {
  createEulaDraftAction,
  publishEulaVersionAction,
  type PlatformEulaActionResult,
} from "@/app/actions/platform-eula";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui";

export type EulaVersionRow = {
  id: string;
  versionNumber: number;
  content: string;
  createdAt: string;
  publishedAt: string | null;
  acceptanceCount: number;
};

export function PlatformEulaConsole({
  versions,
}: {
  versions: EulaVersionRow[];
}) {
  const [draftContent, setDraftContent] = useState("");
  const [createState, createAction, createPending] = useActionState(
    createEulaDraftAction,
    null as PlatformEulaActionResult | null,
  );
  const [publishState, publishAction, publishPending] = useActionState(
    publishEulaVersionAction,
    null as PlatformEulaActionResult | null,
  );

  const published = versions.find((v) => v.publishedAt);

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-edge bg-surface p-5">
        <h2 className="text-lg font-semibold tracking-tight">Versions</h2>
        <p className="mt-1 text-sm text-muted">
          Only one version is published at a time. Published text cannot be
          edited — create a new draft and publish it to require re-acceptance.
        </p>
        {publishState ? (
          <p
            className={`mt-3 text-sm ${publishState.ok ? "text-success" : "text-danger"}`}
            role="status"
          >
            {publishState.message}
          </p>
        ) : null}
        <ul className="mt-4 divide-y divide-slate-100">
          {versions.map((v) => {
            const isPublished = Boolean(v.publishedAt);
            return (
              <li key={v.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      Version {v.versionNumber}
                      {isPublished ? (
                        <span className="ml-2 rounded bg-success-tint px-1.5 py-0.5 text-xs font-medium text-success">
                          Published
                        </span>
                      ) : (
                        <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
                          Draft
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-subtle">
                      Created {new Date(v.createdAt).toLocaleString()}
                      {v.publishedAt
                        ? ` · Published ${new Date(v.publishedAt).toLocaleString()}`
                        : ""}
                      {` · ${v.acceptanceCount} acceptance${v.acceptanceCount === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  {!isPublished ? (
                    <form action={publishAction}>
                      <input type="hidden" name="eulaVersionId" value={v.id} />
                      <button
                        type="submit"
                        disabled={publishPending}
                        className={PRIMARY_BUTTON_CLASS}
                      >
                        {publishPending ? "Publishing…" : "Publish"}
                      </button>
                    </form>
                  ) : null}
                </div>
                <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-edge bg-canvas p-3 font-sans text-xs text-ink">
                  {v.content}
                </pre>
              </li>
            );
          })}
        </ul>
        {versions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No versions yet.</p>
        ) : null}
        {published ? (
          <p className="mt-2 text-xs text-subtle">
            Current published: version {published.versionNumber}
          </p>
        ) : (
          <p className="mt-2 text-sm text-warning">
            No version is published. Users will not be gated until you publish
            one.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <h2 className="text-lg font-semibold tracking-tight">
          Create draft version
        </h2>
        <p className="mt-1 text-sm text-muted">
          Paste the full legal text. Publishing later will unpublish the current
          live version.
        </p>
        <form action={createAction} className="mt-4 space-y-3">
          <textarea
            name="content"
            required
            rows={16}
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            className="w-full rounded-md border border-edge-strong px-3 py-2 font-mono text-xs text-ink"
            placeholder="Paste EULA / Terms of Service text…"
          />
          {createState ? (
            <p
              className={`text-sm ${createState.ok ? "text-success" : "text-danger"}`}
              role="status"
            >
              {createState.message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={createPending || draftContent.trim().length < 40}
            className={SECONDARY_BUTTON_CLASS}
          >
            {createPending ? "Saving…" : "Save draft"}
          </button>
        </form>
      </section>
    </div>
  );
}
