"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scoreContactsAction } from "@/app/actions/scoring";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
import { vocab } from "@/lib/product-config";

export type ScoringReadinessView = {
  totalContacts: number;
  companiesResearched: number;
  companiesMissingResearch: number;
  alreadyScored: number;
  pending: number;
  failed: number;
  aiConfigured: boolean;
  contactResearchAiConfigured: boolean;
  contactResearchEnabled: boolean;
  unconfiguredRoleLabels: string[];
};

export function ScoreContactsPanel({
  runId,
  readiness,
}: {
  runId: string;
  readiness: ScoringReadinessView;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const incompleteResearch = readiness.companiesMissingResearch > 0;
  const canScore = true;

  function runScore(forceRescore: boolean) {
    const formData = new FormData();
    formData.set("scoringRunId", runId);
    if (forceRescore) formData.set("forceRescore", "1");

    startTransition(async () => {
      const result = await scoreContactsAction(formData);
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={vocab.contact.Plural} value={readiness.totalContacts} />
        <Stat
          label="Companies researched"
          value={readiness.companiesResearched}
        />
        <Stat
          label="Companies missing research"
          value={readiness.companiesMissingResearch}
        />
        <Stat label="Already scored" value={readiness.alreadyScored} />
      </div>

      {!canScore ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Scoring cannot run until required AI roles are configured
          {readiness.unconfiguredRoleLabels.length > 0
            ? `: ${readiness.unconfiguredRoleLabels.join(", ")}`
            : ""}
          . Set the matching environment variables and restart. See Settings.
        </p>
      ) : null}

      {incompleteResearch ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Some companies have no usable research. Scoring will mark unsupported
          facts as unknown rather than inventing them.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <PrimaryButton
          disabled={pending || !canScore || readiness.totalContacts === 0}
          onClick={() => runScore(false)}
        >
          {pending ? "Scoring…" : `Score ${vocab.contact.Plural}`}
        </PrimaryButton>
        <SecondaryButton
          disabled={
            pending ||
            !canScore ||
            readiness.alreadyScored + readiness.failed === 0
          }
          onClick={() => runScore(true)}
        >
          Rescore All
        </SecondaryButton>
      </div>

      {message ? (
        <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
