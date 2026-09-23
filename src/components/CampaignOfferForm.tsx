"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateCampaignOfferAction,
  type CampaignOfferActionResult,
} from "@/app/actions/campaign-offer";
import type { CampaignOfferFields } from "@/lib/campaign/offer-validation";
import { Field, PRIMARY_BUTTON_CLASS, SubmitButton } from "@/components/ui";
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
            state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      ) : null}

      {state?.ok ? (
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3"
          data-testid="campaign-offer-next-step"
        >
          <p className="text-sm font-medium text-emerald-950">
            Setup saved. Next: attach {vocab.list.aSingular}.
          </p>
          <p className="mt-1 text-sm text-emerald-900">
            An offer is optional. Continue to the {vocab.list.Singular} stage to research, score,
            and add {vocab.contact.plural}.
          </p>
          <Link
            href={`/campaigns/${campaignId}?stage=list`}
            className={cn(PRIMARY_BUTTON_CLASS, "mt-3")}
          >
            Continue to {vocab.list.Singular}
          </Link>
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
