"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveTitleSuggestionAction } from "@/app/actions/scoring";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
import { countedNoun, vocab } from "@/lib/product-config";

export type TitleSuggestionView = {
  id: string;
  unmatchedTitle: string;
  contactCount: number;
  proposedPersonaId: string | null;
  proposedPersonaName: string | null;
  reasoning: string | null;
  status: "PENDING" | "APPROVED" | "DISMISSED";
};

export function TitleSuggestionReview({
  runId,
  suggestions,
  personas,
}: {
  runId: string;
  suggestions: TitleSuggestionView[];
  personas: Array<{ id: string; name: string }>;
}) {
  const pending = suggestions.filter((row) => row.status === "PENDING");
  if (pending.length === 0) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        These titles did not match any {vocab.persona.singular}&apos;s likely titles. Approve a
        proposal to add the title permanently and score those {vocab.contact.plural}, assign
        a different {vocab.persona.singular}, or dismiss so this {vocab.product.singular} is not asked again.
      </p>
      <div className="space-y-3">
        {pending.map((suggestion) => (
          <TitleSuggestionRow
            key={suggestion.id}
            runId={runId}
            suggestion={suggestion}
            personas={personas}
          />
        ))}
      </div>
    </div>
  );
}

function TitleSuggestionRow({
  runId,
  suggestion,
  personas,
}: {
  runId: string;
  suggestion: TitleSuggestionView;
  personas: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [personaId, setPersonaId] = useState(
    suggestion.proposedPersonaId ?? "",
  );
  const [message, setMessage] = useState<string | null>(null);
  const hasProposal = Boolean(suggestion.proposedPersonaId);

  function submit(action: "approve" | "assign" | "dismiss") {
    const formData = new FormData();
    formData.set("suggestionId", suggestion.id);
    formData.set("scoringRunId", runId);
    formData.set("action", action);
    if (action !== "dismiss") {
      formData.set(
        "personaId",
        action === "approve"
          ? (suggestion.proposedPersonaId ?? personaId)
          : personaId,
      );
    }

    startTransition(async () => {
      const result = await resolveTitleSuggestionAction(formData);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-edge bg-canvas px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {suggestion.unmatchedTitle}
        </p>
        <p className="text-xs text-subtle">
          {countedNoun(suggestion.contactCount, vocab.contact)}
        </p>
      </div>
      <p className="mt-1 text-sm text-ink">
        {hasProposal ? (
          <>
            Proposed:{" "}
            <span className="font-medium">
              {suggestion.proposedPersonaName}
            </span>
          </>
        ) : (
          <span className="font-medium text-ink">
            No {vocab.persona.singular} match proposed
          </span>
        )}
      </p>
      {suggestion.reasoning ? (
        <p className="mt-1 text-sm text-muted">{suggestion.reasoning}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <PrimaryButton
          disabled={pending || !hasProposal}
          onClick={() => submit("approve")}
        >
          {pending ? "Saving…" : "Approve"}
        </PrimaryButton>
        <label className="text-sm">
          <span className="sr-only">Assign to {vocab.persona.singular}</span>
          <select
            value={personaId}
            onChange={(event) => setPersonaId(event.target.value)}
            className="rounded-md border border-edge-strong bg-surface px-2 py-2 text-sm"
            disabled={pending}
          >
            <option value="">Assign to a different {vocab.persona.singular}</option>
            {personas.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.name}
              </option>
            ))}
          </select>
        </label>
        <SecondaryButton
          disabled={pending || !personaId}
          onClick={() => submit("assign")}
        >
          Assign
        </SecondaryButton>
        <SecondaryButton disabled={pending} onClick={() => submit("dismiss")}>
          Dismiss
        </SecondaryButton>
      </div>
      {message ? (
        <p className="mt-2 text-sm text-ink">{message}</p>
      ) : null}
    </div>
  );
}
