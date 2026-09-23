"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  buildPersonaFromBuyerRoleAction,
  type PersonaSetupActionResult,
} from "@/app/actions/persona-setup";
import { Field, SubmitButton } from "@/components/ui";
import type { SuggestedBuyerRole } from "@/lib/product-research/contract";
import { vocab } from "@/lib/product-config";

const initial: PersonaSetupActionResult | null = null;

export function BuildPersonaForm({
  productId,
  role,
}: {
  productId: string;
  role: SuggestedBuyerRole | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    buildPersonaFromBuyerRoleAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok && state.personaSetupRunId) {
      router.push(
        `/setup/${productId}/personas/${state.personaSetupRunId}`,
      );
      router.refresh();
    }
  }, [state, productId, router]);

  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <input type="hidden" name="productId" value={productId} />
      <input
        type="hidden"
        name="suggestionKey"
        value={role?.suggestionKey ?? ""}
      />
      <Field
        label={`${vocab.persona.Singular} name`}
        name="name"
        required
        defaultValue={role?.name ?? ""}
      />
      <Field
        label="Likely Titles"
        name="likelyTitles"
        defaultValue={(role?.likelyTitles ?? []).join(", ")}
        hint={`Titles are evidence, not the ${vocab.persona.Singular} definition.`}
      />
      <Field
        label="Department / Function"
        name="departmentFunction"
        defaultValue={role?.departmentFunction ?? ""}
      />
      <Field
        label="Why this role matters"
        name="whyThisRoleMatters"
        as="textarea"
        defaultValue={role?.whyThisRoleMatters ?? ""}
      />
      <Field
        label={`Optional ${vocab.persona.Singular} notes`}
        name="notes"
        as="textarea"
        hint={`Optional context. You can Build ${vocab.persona.Singular} with only the selected role.`}
      />
      <SubmitButton disabled={pending}>
        {pending ? `Researching ${vocab.persona.Singular}…` : `Build ${vocab.persona.Singular}`}
      </SubmitButton>
      {state ? (
        <p
          role="status"
          className={
            state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
