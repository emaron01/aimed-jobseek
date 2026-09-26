"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  addContactsToCampaignAction,
  addScoringRunContactsToCampaignAction,
  type CampaignContactsActionResult,
} from "@/app/actions/campaign-contacts";
import { listIndexHref, scoringRunDisplayName } from "@/lib/lists/campaign-query";
import {AppButton, AppActionLink } from "@/components/ui";
import { vocab } from "@/lib/product-config";

const initial: CampaignContactsActionResult | null = null;

export function CampaignContactsManager({
  campaignId,
  search,
  contacts,
  scoringRuns,
  selectedScoringRunId,
}: {
  campaignId: string;
  search: string;
  contacts: Array<{
    id: string;
    name: string;
    email: string | null;
    title: string | null;
    company: string | null;
    listName: string;
  }>;
  scoringRuns: Array<{
    id: string;
    listName: string;
    label?: string | null;
    status: "COMPLETED" | "PARTIAL";
    completedScoreCount: number;
    createdLabel: string;
  }>;
  /** Pre-select this run when returning from scoring. */
  selectedScoringRunId?: string | null;
}) {
  const router = useRouter();
  const [contactState, contactAction, contactPending] = useActionState(
    addContactsToCampaignAction,
    initial,
  );
  const [runState, runAction, runPending] = useActionState(
    addScoringRunContactsToCampaignAction,
    initial,
  );

  useEffect(() => {
    if (contactState?.ok) router.refresh();
  }, [contactState, router]);

  useEffect(() => {
    if (runState?.ok) router.refresh();
  }, [runState, router]);

  const hasScoredRuns = scoringRuns.length > 0;
  const preselectedRunId =
    selectedScoringRunId &&
    scoringRuns.some((run) => run.id === selectedScoringRunId)
      ? selectedScoringRunId
      : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-2">
        <AppActionLink
          href={listIndexHref({ campaignId })}
          variant="primary"
        >
          Select an Existing {vocab.list.Singular} To Be Researched and Scored
        </AppActionLink>
        <AppButton
          type="submit"
          form="campaign-scored-run-form"
          disabled={!hasScoredRuns || runPending}
          variant="secondary"
        >
          {runPending ? "Adding…" : "Add from Scored Run"}
        </AppButton>
      </div>

      {hasScoredRuns ? (
        <form
          id="campaign-scored-run-form"
          action={runAction}
          className="space-y-3"
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <label className="block min-w-72 text-sm">
            <span className="font-medium text-ink">Scoring run</span>
            <select
              name="scoringRunId"
              required
              key={preselectedRunId || "none"}
              defaultValue={preselectedRunId}
              className="mt-1 w-full rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select a scored run
              </option>
              {scoringRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {scoringRunDisplayName(run)} · {run.completedScoreCount}{" "}
                  scored · {run.status} · {run.createdLabel}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-muted">
            Only completed scores from runs matching this {vocab.campaign.singular}&apos;s
            {vocab.product.Singular}, {vocab.icp.singular}, and {vocab.persona.Singular} are available.
          </p>
          {runState ? (
            <p
              role="status"
              data-testid="campaign-scoring-run-status"
              className={
                runState.ok ? "text-sm text-success" : "text-sm text-danger"
              }
            >
              {runState.message}
            </p>
          ) : null}
        </form>
      ) : (
        <div
          className="rounded-md border border-warning bg-warning-tint px-3 py-3 text-sm text-warning"
          data-testid="campaign-list-score-hint"
        >
          <p className="font-medium">No scored runs for this {vocab.campaign.singular} yet</p>
          <p className="mt-1">
            Select {vocab.list.aSingular}, research companies, then score for this {vocab.campaign.singular}.
            When a run completes, choose Save and return to {vocab.campaign.singular} on the
            score report to attach Ready to include {vocab.contact.plural}.
          </p>
          <Link
            href={listIndexHref({ campaignId })}
            className="mt-2 inline-flex font-medium underline"
          >
            Go to {vocab.list.Plural} to research and score
          </Link>
        </div>
      )}

      <section className="border-t border-edge pt-5">
        <h3 className="text-sm font-semibold text-ink">
          Search existing {vocab.contact.plural}
        </h3>
        <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1 text-sm">
            <span className="font-medium text-ink">Search</span>
            <input
              name="q"
              defaultValue={search}
              placeholder="Name, email, company, or title"
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </label>
          <AppButton
            type="submit"
            variant="secondary"
          >
            Search
          </AppButton>
          {search ? (
            <Link
              href={`/campaigns/${campaignId}`}
              className="px-2 py-2 text-sm text-muted underline"
            >
              Clear
            </Link>
          ) : null}
        </form>

        <form action={contactAction} className="mt-4 space-y-3">
          <input type="hidden" name="campaignId" value={campaignId} />
          {contactState ? (
            <p
              role="status"
              data-testid="campaign-contacts-status"
              className={
                contactState.ok
                  ? "text-sm text-success"
                  : "text-sm text-danger"
              }
            >
              {contactState.message}
            </p>
          ) : null}

          {contacts.length > 0 ? (
            <>
              <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-md border border-edge">
                {contacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-canvas"
                  >
                    <input
                      type="checkbox"
                      name="contactIds"
                      value={contact.id}
                      className="mt-1"
                    />
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium text-ink">
                        {contact.name}
                      </span>
                      <span className="block text-muted">
                        {[contact.title, contact.company]
                          .filter(Boolean)
                          .join(" · ") || contact.email || "No role details"}
                      </span>
                      <span className="block text-xs text-subtle">
                        {contact.email ?? "No email"} · {contact.listName}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <AppButton
                type="submit"
                disabled={contactPending}
                
              >
                {contactPending ? "Adding…" : `Add selected ${vocab.contact.plural}`}
              </AppButton>
            </>
          ) : (
            <p className="text-sm text-muted">
              {search
                ? `No unattached ${vocab.contact.plural} match this search.`
                : `No unattached ${vocab.contact.plural} are available.`}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
