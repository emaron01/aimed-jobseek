"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createProductMinimalAction,
  researchAndBuildProductAction,
  retryProductSynthesisAction,
  type ProductSetupActionResult,
} from "@/app/actions/product-setup";
import { Field, SECONDARY_BUTTON_CLASS, SecondaryButton, SubmitButton, AppButton } from "@/components/ui";
import { polishCopy, vocab } from "@/lib/product-config";

const initial: ProductSetupActionResult | null = null;

function Status({ result }: { result: ProductSetupActionResult | null }) {
  if (!result) return null;
  return (
    <p
      role="status"
      className={
        result.ok ? "mt-3 text-sm text-success" : "mt-3 text-sm text-danger"
      }
    >
      {result.message}
    </p>
  );
}

export function AssistedProductIntake({
  productId,
  defaultName,
  defaultUrl,
  urlResearchStale,
  latestEvidenceBundleId,
}: {
  productId?: string;
  defaultName?: string;
  defaultUrl?: string;
  urlResearchStale?: boolean;
  latestEvidenceBundleId?: string | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    researchAndBuildProductAction,
    initial,
  );
  const [saveOnly, saveAction, savePending] = useActionState(
    createProductMinimalAction,
    initial,
  );
  const [retry, retryAction, retryPending] = useActionState(
    retryProductSynthesisAction,
    initial,
  );

  useEffect(() => {
    // Navigate to research page when evidence was preserved (success or synthesis failure).
    if (state?.productId && state.evidenceBundleId) {
      router.push(`/setup/${state.productId}/research`);
      router.refresh();
    }
  }, [state, router]);

  useEffect(() => {
    if (saveOnly?.ok && saveOnly.productId && !productId) {
      router.push(`/setup/${saveOnly.productId}/research`);
      router.refresh();
    }
  }, [saveOnly, productId, router]);

  return (
    <div className="space-y-6" data-testid="assisted-product-intake">
      <div>
        <h3 className="text-lg font-semibold text-ink">
          Tell us about your background
        </h3>
        <p className="mt-1 text-sm text-muted">
          Start with the materials you already have — your resume, a pasted
          LinkedIn profile, notes about goals, and personal site, portfolio, or
          GitHub URLs. {vocab.product.Singular} name is required; everything else is optional.
          We draft your {vocab.product.singular} once for your review.
        </p>
      </div>

      <form action={action} className="grid gap-4 md:grid-cols-2">
        {productId ? (
          <input type="hidden" name="productId" value={productId} />
        ) : null}
        <div className="md:col-span-2">
          <Field
            label={`${vocab.product.Singular} Name`}
            name="name"
            required
            defaultValue={defaultName}
          />
        </div>

        <div className="md:col-span-2 space-y-3">
          <label className="flex cursor-pointer flex-col rounded-lg border border-ink bg-ink p-5 text-on-ink transition hover:bg-ink/90">
            <span className="text-base font-semibold">Upload materials</span>
            <span className="mt-1 text-sm text-on-ink/80">
              Resume and other documents. PDF, DOCX, TXT, MD · Max 15 MiB each.
            </span>
            <input
              type="file"
              name="files"
              multiple
              accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
              className="mt-4 block w-full text-sm text-on-ink file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
              data-testid="product-upload-materials"
            />
          </label>

          <div className="rounded-lg border border-edge-strong bg-surface p-5">
            <label className="block" htmlFor="pastedContent">
              <span className="text-base font-semibold text-ink">
                Paste resume or LinkedIn profile text
              </span>
              <span className="mt-1 block text-sm text-subtle">
                Paste your resume or LinkedIn profile text. LinkedIn blocks
                automated reading, so a LinkedIn URL will not work.
              </span>
            </label>
            <textarea
              id="pastedContent"
              name="pastedContent"
              rows={8}
              placeholder="Paste resume or LinkedIn profile text here…"
              className="mt-3 w-full rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm text-ink outline-none ring-focus placeholder:text-subtle focus:ring-2"
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <Field
            label={`${vocab.product.Singular} Notes`}
            name="notes"
            as="textarea"
            hint="Anything important about your goals, target roles, constraints, or context that is not in the materials above."
          />
        </div>

        <div className="md:col-span-2 rounded-lg border border-edge bg-canvas p-4 space-y-3">
          <p className="text-sm text-muted">
            Many personal sites cannot be read automatically — they load content
            with JavaScript or block automated access. Uploading or pasting the
            materials you already have usually produces a better profile than a
            link alone. For LinkedIn, paste the profile text; LinkedIn blocks
            automated reading.
          </p>
          <Field
            label="Personal site, portfolio, or GitHub URL (optional)"
            name="primaryUrl"
            defaultValue={defaultUrl}
            placeholder="https://"
            hint="A personal site, portfolio, or GitHub URL can help. Do not use a LinkedIn URL — paste that profile text instead."
          />
          <Field
            label="Additional URLs (optional)"
            name="additionalUrls"
            as="textarea"
            rows={2}
            placeholder="One URL per line"
            hint="Additional personal site, portfolio, or GitHub pages. Do not add LinkedIn URLs."
          />
          {urlResearchStale ? (
            <div className="rounded-md border border-warning bg-warning-tint px-3 py-2 text-sm text-warning">
              Website research is past the freshness window. Check “Refresh
              website research” to reacquire URLs (explicit action).
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" name="forceUrlRefresh" value="1" />
                Refresh website research
              </label>
            </div>
          ) : null}
        </div>

        <div className="md:col-span-2 flex flex-wrap gap-2">
          <SubmitButton disabled={pending || savePending || retryPending}>
            {pending ? "Researching…" : `${polishCopy.researchAndGenerate} ${vocab.product.singular}`}
          </SubmitButton>
          {!productId ? (
            <AppButton
              type="submit"
              formAction={saveAction}
              disabled={pending || savePending}
              className={SECONDARY_BUTTON_CLASS}
            >
              {savePending ? "Saving…" : `Save ${vocab.product.Singular} only`}
            </AppButton>
          ) : null}
        </div>
      </form>
      <Status result={state ?? saveOnly} />

      {productId && latestEvidenceBundleId ? (
        <form action={retryAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="productId" value={productId} />
          <input
            type="hidden"
            name="evidenceBundleId"
            value={latestEvidenceBundleId}
          />
          <SecondaryButton type="submit" disabled={retryPending}>
            {retryPending ? "Trying again…" : "Try building again"}
          </SecondaryButton>
          <Status result={retry} />
        </form>
      ) : null}
    </div>
  );
}

export { ProductDraftReview } from "@/components/ProductDraftReview";
