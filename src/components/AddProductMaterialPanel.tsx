"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  addProductSourcesAction,
  type ProductSetupActionResult,
} from "@/app/actions/product-setup";
import { Field, SECONDARY_BUTTON_CLASS, SubmitButton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { vocab } from "@/lib/product-config";

const initial: ProductSetupActionResult | null = null;

export function AddProductMaterialPanel({ productId }: { productId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    addProductSourcesAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok && state.setupRunId && state.status === "NEEDS_REVIEW") {
      router.push(
        `/setup/${productId}/research/resynthesis/${state.setupRunId}`,
      );
      router.refresh();
    }
  }, [state, productId, router]);

  return (
    <div className="space-y-4" data-testid="add-product-material">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Add material</h3>
        <p className="mt-1 text-sm text-slate-600">
          Upload, paste, or add notes about new {vocab.product.singular} material. We will
          re-synthesize a draft for review — your approved profile stays in
          place until you confirm.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="productId" value={productId} />
        <Field
          label="Notes"
          name="notes"
          as="textarea"
          rows={3}
          placeholder="e.g. Updated positioning from Q3 launch deck"
          hint="Optional context for the new material."
        />
        <Field
          label="Paste content"
          name="pastedContent"
          as="textarea"
          rows={6}
          placeholder={`Paste new ${vocab.product.singular} material here`}
          hint={`${vocab.product.Singular} copy, release notes, or a datasheet excerpt.`}
        />
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Upload documents</span>
          <span className="mt-0.5 block text-xs font-normal text-slate-500">
            PDF, Word, or plain text. You can select multiple files.
          </span>
          <input
            type="file"
            name="files"
            multiple
            accept=".pdf,.doc,.docx,.txt,.md,.rtf"
            className={cn(SECONDARY_BUTTON_CLASS, "mt-1", "block", "w-full")}
          />
        </label>
        <SubmitButton disabled={pending}>
          {pending ? "Re-synthesizing…" : "Add material & re-synthesize"}
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
    </div>
  );
}
