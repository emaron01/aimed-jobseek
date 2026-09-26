"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  updateCampaignOfferAction,
  type CampaignOfferActionResult,
} from "@/app/actions/campaign-offer";
import type { CampaignOfferFields } from "@/lib/campaign/offer-validation";
import {Field, SubmitButton, AppActionLink } from "@/components/ui";
import { cn } from "@/lib/utils";
import { vocab } from "@/lib/product-config";

const initial: CampaignOfferActionResult | null = null;

export function CampaignOfferForm({
  campaignId,
  offer,
}: {
  campaignId: string;
  offer: CampaignOfferFields;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateCampaignOfferAction,
    initial,
  );
  const values = state?.values ?? offer;

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      {state ? (
        <p
          role="status"
          data-testid="campaign-offer-status"
          className={
            state.ok ? "text-sm text-success" : "text-sm text-danger"
          }
        >
          {state.message}
        </p>
      ) : null}

      {state?.ok ? (
        <div
          className="rounded-md border border-success bg-success-tint px-3 py-3"
          data-testid="campaign-offer-next-step"
        >
          <p className="text-sm font-medium text-success">
            Setup saved. Next: attach {vocab.list.aSingular}.
          </p>
          <p className="mt-1 text-sm text-success">
            An offer is optional. Continue to the {vocab.list.Singular} stage to research, score,
            and add {vocab.contact.plural}.
          </p>
          <AppActionLink
            href={`/campaigns/${campaignId}?stage=list`}
            variant="primary" className={cn("mt-3")}
          >
            Continue to {vocab.list.Singular}
          </AppActionLink>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Offer Name"
          name="offerName"
          defaultValue={values.offerName}
          hint={`Optional. Not required to save or continue to ${vocab.list.Singular}.`}
        />
        <Field
          label="Primary CTA"
          name="offerCta"
          defaultValue={values.offerCta}
          hint="Optional."
        />
        <div className="md:col-span-2">
          <Field
            label="Offer Description"
            name="offerDescription"
            as="textarea"
            defaultValue={values.offerDescription}
            hint="Optional. Used in email copy when present."
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Offer Notes"
            name="offerNotes"
            as="textarea"
            defaultValue={values.offerNotes}
            hint="Optional."
          />
        </div>
      </div>

      <SubmitButton disabled={pending}>
        {pending ? "Validating…" : "Save offer"}
      </SubmitButton>
    </form>
  );
}
