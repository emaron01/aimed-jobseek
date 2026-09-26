"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createCampaignAction } from "@/app/actions";
import {
  EMAIL_GUIDANCE_MAX_CHARS,
  type CampaignActionResult,
} from "@/lib/campaign/save";
import { formatProductCampaignOmission } from "@/lib/workflow/product-campaign-readiness";
import { EmailGuidancePromptExamples } from "@/components/EmailGuidancePromptExamples";
import { Field, SubmitButton } from "@/components/ui";
import { vocab } from "@/lib/product-config";

type ProductOption = {
  id: string;
  name: string;
  ready: boolean;
  omissionReason: string | null;
};

const initial: CampaignActionResult | null = null;

export function NewCampaignForm({
  products,
}: {
  products: ProductOption[];
}) {
  const router = useRouter();
  const readyProducts = products.filter((product) => product.ready);
  const [productId, setProductId] = useState(
    readyProducts.length === 1 ? readyProducts[0]!.id : "",
  );
  const [postingText, setPostingText] = useState("");
  const [state, formAction, pending] = useActionState(
    createCampaignAction,
    initial,
  );

  const restored = state && !state.ok ? state.values : undefined;
  const formKey =
    state && !state.ok
      ? `campaign-fail-${state.message}-${restored?.name?.slice(0, 24) ?? ""}`
      : "campaign-new";

  const selectedProduct = products.find((product) => product.id === productId);
  const productReady = selectedProduct?.ready ?? false;
  const canSubmit =
    Boolean(postingText.trim()) && Boolean(productId) && productReady;

  const restoreKey = restored ? restored.productId ?? "" : "";
  const [appliedRestoreKey, setAppliedRestoreKey] = useState("");
  if (restoreKey && restoreKey !== appliedRestoreKey) {
    setAppliedRestoreKey(restoreKey);
    if (restored?.productId) setProductId(restored.productId);
  }

  useEffect(() => {
    if (!state?.ok) return;
    router.push(state.campaignId ? `/campaigns/${state.campaignId}` : "/");
    router.refresh();
  }, [state, router]);

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
              ? "md:col-span-2 text-sm text-success"
              : "md:col-span-2 text-sm text-danger"
          }
        >
          {state.message}
        </p>
      ) : null}
      <div className="md:col-span-2">
        <label className="block text-sm">
          <span className="font-medium text-ink">Job posting</span>
          <span className="mt-1 block text-xs text-subtle">
            Paste the posting. The URL is stored for reference and is not fetched.
          </span>
          <textarea
            name="postingText"
            required
            rows={8}
            value={postingText}
            onChange={(event) => setPostingText(event.target.value)}
            className="mt-1 w-full rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm text-ink outline-none ring-focus focus:ring-2"
          />
        </label>
        {state?.fieldErrors?.postingText ? (
          <p className="mt-1 text-sm text-danger">{state.fieldErrors.postingText}</p>
        ) : null}
      </div>
      <Field
        label="Posting URL"
        name="postingUrl"
        defaultValue={restored?.postingUrl}
        hint="Optional. Not opened or fetched."
      />
      <Field
        label={`${vocab.campaign.Singular} Name`}
        name="name"
        required
        defaultValue={restored?.name}
      />

      <label className="block text-sm">
        <span className="font-medium text-ink">{vocab.product.Singular}</span>
        <select
          name="productId"
          required
          value={productId}
          onChange={(event) => {
            setProductId(event.target.value);
          }}
          className="mt-1 w-full rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm outline-none ring-focus focus:ring-2"
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
          <p className="mt-2 text-sm text-warning">
            {selectedProduct.name} cannot be used yet:{" "}
            {selectedProduct.omissionReason}
          </p>
        ) : null}
      </label>

      <div className="space-y-4 border-t border-edge pt-4 md:col-span-2">
        <div>
          <label className="block text-sm">
            <span className="font-medium text-ink">
              {vocab.campaign.Singular} guidance
            </span>
            <span className="mt-1 block text-xs text-subtle">
              Steers materials for this {vocab.campaign.singular}, up to{" "}
              {EMAIL_GUIDANCE_MAX_CHARS} characters.
            </span>
            <textarea
              name="emailGuidance"
              rows={3}
              maxLength={EMAIL_GUIDANCE_MAX_CHARS}
              defaultValue={restored?.emailGuidance}
              placeholder="Emphasize the work that matches this role"
              className="mt-1 w-full rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm text-ink outline-none ring-focus placeholder:text-subtle focus:ring-2"
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
              : !postingText.trim()
                ? "Paste a job posting"
                : productId && !productReady
                  ? `Finish ${vocab.product.singular} setup first`
                  : `Select ${vocab.product.aSingular}`}
        </SubmitButton>
      </div>
    </form>
  );
}
