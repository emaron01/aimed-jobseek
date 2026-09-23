"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createCampaignAction } from "@/app/actions";
import {
  DEFAULT_EMAIL_LENGTH,
  EMAIL_GUIDANCE_MAX_CHARS,
  EMAIL_LENGTH_OPTIONS,
  type CampaignActionResult,
} from "@/lib/campaign/save";
import { formatProductCampaignOmission } from "@/lib/workflow/product-campaign-readiness";
import { EmailGuidancePromptExamples } from "@/components/EmailGuidancePromptExamples";
import { Field, SubmitButton } from "@/components/ui";
import { vocab, vocabExamples } from "@/lib/product-config";

type Option = { id: string; name: string; productId: string };
type ProductOption = {
  id: string;
  name: string;
  ready: boolean;
  omissionReason: string | null;
};

const initial: CampaignActionResult | null = null;

export function NewCampaignForm({
  products,
  icps,
  personas,
}: {
  products: ProductOption[];
  icps: Option[];
  personas: Option[];
}) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [icpId, setIcpId] = useState("");
  const [personaIds, setPersonaIds] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState(
    createCampaignAction,
    initial,
  );

  const restored = state && !state.ok ? state.values : undefined;
  const formKey =
    state && !state.ok
      ? `campaign-fail-${state.message}-${restored?.name?.slice(0, 24) ?? ""}`
      : "campaign-new";

  const productIcps = useMemo(
    () => icps.filter((icp) => icp.productId === productId),
    [icps, productId],
  );
  const productPersonas = useMemo(
    () => personas.filter((persona) => persona.productId === productId),
    [personas, productId],
  );

  const selectedProduct = products.find((product) => product.id === productId);
  const productReady = selectedProduct?.ready ?? false;
  const allProductPersonasSelected =
    productPersonas.length > 0 &&
    productPersonas.every((persona) => personaIds.includes(persona.id));
  const canSubmit =
    Boolean(productId) &&
    productReady &&
    Boolean(icpId) &&
    productIcps.some((icp) => icp.id === icpId);

  useEffect(() => {
    if (!state?.ok) return;
    router.push(state.campaignId ? `/campaigns/${state.campaignId}` : "/");
    router.refresh();
  }, [state, router]);

  useEffect(() => {
    if (!restored) return;
    if (restored.productId) setProductId(restored.productId);
    if (restored.icpId) setIcpId(restored.icpId);
    if (restored.allPersonas) {
      setPersonaIds(
        personas
          .filter((persona) => persona.productId === restored.productId)
          .map((persona) => persona.id),
      );
    } else if (restored.personaIds.length > 0) {
      setPersonaIds(restored.personaIds);
    } else if (restored.personaId) {
      setPersonaIds([restored.personaId]);
    }
  }, [restored]);

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid gap-4 md:grid-cols-2"
    >
      {state ? (
        <p
          role="status"
          data-testid="campaign-action-status"
          className={
            state.ok
              ? "md:col-span-2 text-sm text-emerald-700"
              : "md:col-span-2 text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      ) : null}
      <Field
        label={`${vocab.campaign.Singular} Name`}
        name="name"
        required
        defaultValue={restored?.name}
      />

      <label className="block text-sm">
        <span className="font-medium text-slate-700">{vocab.product.Singular}</span>
        <select
          name="productId"
          required
          value={productId}
          onChange={(event) => {
            setProductId(event.target.value);
            setIcpId("");
            setPersonaIds(
              personas
                .filter((persona) => persona.productId === event.target.value)
                .map((persona) => persona.id),
            );
          }}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2"
        >
          <option value="" disabled>
            Select {vocab.product.singular}
          </option>
          {products.map((product) => (
            <option
              key={product.id}
              value={product.id}
              disabled={!product.ready}
            >
              {formatProductCampaignOmission(product.name, {
                ready: product.ready,
                blockers: product.omissionReason
                  ? product.omissionReason.split("; ")
                  : [],
                omissionReason: product.omissionReason,
              })}
            </option>
          ))}
        </select>
        {selectedProduct && !selectedProduct.ready && selectedProduct.omissionReason ? (
          <p className="mt-2 text-sm text-amber-900">
            {selectedProduct.name} cannot be used yet:{" "}
            {selectedProduct.omissionReason}
          </p>
        ) : null}
      </label>

      <label className="block text-sm">
        <span className="font-medium text-slate-700">{vocab.icp.singular}</span>
        <select
          name="icpId"
          required
          value={icpId}
          disabled={!productId}
          onChange={(event) => setIcpId(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2 disabled:bg-slate-50"
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

      <fieldset className="block text-sm md:col-span-2">
        <legend className="font-medium text-slate-700">{vocab.persona.Plural} in play</legend>
        <p className="mt-1 text-xs text-slate-500">
          Defaults to every {vocab.persona.singular} for this {vocab.product.singular}. {vocab.persona.Singular} is a property of
          the {vocab.contact.singular}; this only limits which roles the {vocab.campaign.singular} will email.
        </p>
        {allProductPersonasSelected ? (
          <input type="hidden" name="allPersonas" value="1" />
        ) : null}
        <div className="mt-2 space-y-2">
          {!productId ? (
            <p className="text-sm text-slate-500">Select {vocab.product.aSingular} first</p>
          ) : productPersonas.length === 0 ? (
            <p className="text-sm text-slate-500">
              This {vocab.product.singular} has no {vocab.persona.plural} yet.
            </p>
          ) : (
            productPersonas.map((persona) => (
              <label
                key={persona.id}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  name="personaIds"
                  value={persona.id}
                  checked={personaIds.includes(persona.id)}
                  onChange={(event) => {
                    setPersonaIds((current) =>
                      event.target.checked
                        ? [...current, persona.id]
                        : current.filter((id) => id !== persona.id),
                    );
                  }}
                />
                {persona.name}
              </label>
            ))
          )}
        </div>
      </fieldset>

      <div className="md:col-span-2 border-t border-slate-200 pt-4">
        <p className="mb-3 text-sm font-medium text-slate-900">
          {vocab.campaign.Singular} offer
        </p>
        <p className="mb-4 text-sm text-slate-600">
          Optional. Offers are {vocab.campaign.singular}-specific and used in email copy when
          present. Leave blank if you do not have one yet — you can still create
          the {vocab.campaign.singular} and move to {vocab.list.Singular}.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Offer Name"
            name="offerName"
            placeholder="Free Forecast Audit"
            defaultValue={restored?.offerName}
            hint={`Optional. Not required to create the ${vocab.campaign.singular}.`}
          />
          <Field
            label="Primary CTA"
            name="offerCta"
            placeholder={vocabExamples.offerCallToActionPlaceholder}
            defaultValue={restored?.offerCta}
            hint="Optional."
          />
          <div className="md:col-span-2">
            <Field
              label="Offer Description"
              name="offerDescription"
              as="textarea"
              defaultValue={restored?.offerDescription}
              hint="Optional."
            />
          </div>
          <div className="md:col-span-2">
            <Field
              label="Offer Notes"
              name="offerNotes"
              as="textarea"
              defaultValue={restored?.offerNotes}
              hint="Optional."
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t border-slate-200 pt-4 md:col-span-2">
        <div>
          <p className="text-sm font-medium text-slate-900">Email length</p>
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
                  defaultChecked={
                    (restored?.emailLength ?? DEFAULT_EMAIL_LENGTH) === value
                  }
                />
                {value === "SHORT"
                  ? "Short"
                  : value === "MEDIUM"
                    ? "Medium"
                    : "Long"}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Email guidance</span>
            <span className="mt-1 block text-xs text-slate-500">
              Steers every generated email in this {vocab.campaign.singular}, up to{" "}
              {EMAIL_GUIDANCE_MAX_CHARS} characters.
            </span>
            <textarea
              name="emailGuidance"
              rows={3}
              maxLength={EMAIL_GUIDANCE_MAX_CHARS}
              defaultValue={restored?.emailGuidance}
              placeholder="Focus on the feature that removes the most manual work"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2"
            />
          </label>
          <EmailGuidancePromptExamples />
        </div>
      </div>

      <div className="md:col-span-2">
        <SubmitButton disabled={!canSubmit || pending}>
          {pending
            ? "Creating…"
            : canSubmit
              ? `Create ${vocab.campaign.singular}`
              : productId && !productReady
                ? `Finish ${vocab.product.singular} setup first`
                : `Select ${vocab.product.singular} and ${vocab.icp.singular}`}
        </SubmitButton>
      </div>
    </form>
  );
}
