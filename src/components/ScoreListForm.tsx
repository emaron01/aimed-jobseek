"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createScoringRunAction,
  type ScoringRunActionResult,
} from "@/app/actions/scoring";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
import { ALL_PERSONAS_VALUE } from "@/lib/scoring/title-fit";
import { vocab } from "@/lib/product-config";

type Option = { id: string; name: string; productId: string };

const initial: ScoringRunActionResult | null = null;

export function ScoreListForm({
  contactListId,
  products,
  icps,
  personas,
  defaultProductId,
  defaultIcpId,
  defaultPersonaId,
  campaignId,
}: {
  contactListId: string;
  products: Array<{ id: string; name: string }>;
  icps: Option[];
  personas: Option[];
  defaultProductId?: string;
  defaultIcpId?: string;
  defaultPersonaId?: string | null;
  /** When set, run is labeled with the campaign and Save and return works. */
  campaignId?: string | null;
}) {
  const [productId, setProductId] = useState(() =>
    products.some((product) => product.id === defaultProductId)
      ? defaultProductId!
      : "",
  );
  const [icpId, setIcpId] = useState(() =>
    icps.some((icp) => icp.id === defaultIcpId) ? defaultIcpId! : "",
  );
  const [personaId, setPersonaId] = useState(() =>
    defaultPersonaId &&
    personas.some((persona) => persona.id === defaultPersonaId)
      ? defaultPersonaId
      : ALL_PERSONAS_VALUE,
  );
  const [state, formAction, pending] = useActionState(
    createScoringRunAction,
    initial,
  );

  const productIcps = useMemo(
    () => icps.filter((icp) => icp.productId === productId),
    [icps, productId],
  );
  const productPersonas = useMemo(
    () => personas.filter((persona) => persona.productId === productId),
    [personas, productId],
  );

  const canSubmit =
    Boolean(productId) &&
    Boolean(icpId) &&
    productIcps.some((icp) => icp.id === icpId) &&
    productPersonas.length > 0 &&
    (personaId === ALL_PERSONAS_VALUE ||
      productPersonas.some((persona) => persona.id === personaId));

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="contactListId" value={contactListId} />
      {campaignId ? (
        <input type="hidden" name="campaignId" value={campaignId} />
      ) : null}

      {state && !state.ok ? (
        <p
          role="status"
          data-testid="scoring-run-status"
          className="md:col-span-2 text-sm text-danger"
        >
          {state.message}
        </p>
      ) : null}

      <label className="block text-sm md:col-span-2">
        <span className="font-medium text-ink">{vocab.product.Singular}</span>
        <select
          name="productId"
          required
          value={productId}
          onChange={(event) => {
            setProductId(event.target.value);
            setIcpId("");
            setPersonaId(ALL_PERSONAS_VALUE);
          }}
          className="mt-1 w-full rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm outline-none ring-focus focus:ring-2"
        >
          <option value="" disabled>
            Select {vocab.product.singular}
          </option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="font-medium text-ink">{vocab.icp.singular}</span>
        <select
          name="icpId"
          required
          value={icpId}
          disabled={!productId}
          onChange={(event) => setIcpId(event.target.value)}
          className="mt-1 w-full rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm outline-none ring-focus focus:ring-2 disabled:bg-canvas"
        >
          <option value="" disabled>
            {productId ? `Select ${vocab.icp.singular}` : `Select ${vocab.product.aSingular} first`}
          </option>
          {productIcps.map((icp) => (
            <option key={icp.id} value={icp.id}>
              {icp.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="font-medium text-ink">{vocab.persona.Singular}</span>
        <select
          name="personaId"
          required
          value={personaId}
          disabled={!productId}
          onChange={(event) => setPersonaId(event.target.value)}
          className="mt-1 w-full rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm outline-none ring-focus focus:ring-2 disabled:bg-canvas"
        >
          <option value={ALL_PERSONAS_VALUE}>
            {productId ? `All ${vocab.persona.plural}` : `Select ${vocab.product.aSingular} first`}
          </option>
          {productPersonas.map((persona) => (
            <option key={persona.id} value={persona.id}>
              {persona.name}
            </option>
          ))}
        </select>
      </label>

      <div className="md:col-span-2 flex gap-2">
        <PrimaryButton type="submit" disabled={!canSubmit || pending}>
          {pending ? "Creating…" : "Create Scoring Run"}
        </PrimaryButton>
        <SecondaryButton
          type="button"
          onClick={() => {
            setProductId("");
            setIcpId("");
            setPersonaId(ALL_PERSONAS_VALUE);
          }}
        >
          Clear
        </SecondaryButton>
      </div>
    </form>
  );
}
