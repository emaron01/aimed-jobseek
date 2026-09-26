"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  addProductSourcesAction,
  type ProductSetupActionResult,
} from "@/app/actions/product-setup";
import { Field, SubmitButton } from "@/components/ui";
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
        <h3 className="text-lg font-semibold text-ink">Add material</h3>
        <p className="mt-1 text-sm text-muted">
          Upload a resume or other documents, paste LinkedIn or resume text, or
          add notes about goals and context. We will rebuild a draft for
          review — your approved {vocab.product.singular} stays in place until you confirm.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="productId" value={productId} />
        <Field
          label="Notes"
          name="notes"
          as="textarea"
          rows={3}
          placeholder="e.g. Targeting staff engineer roles in Seattle"
          hint="Optional context about goals, constraints, or what changed."
        />
        <Field
          label="Paste content"
          name="pastedContent"
          as="textarea"
          rows={6}
          placeholder="Paste resume or LinkedIn profile text here"
          hint="Resume text, LinkedIn profile text, or notes. LinkedIn URLs cannot be read automatically."
        />
        <label className="block text-sm">
          <span className="font-medium text-ink">Upload documents</span>
          <span className="mt-0.5 block text-xs font-normal text-subtle">
            PDF, Word, or plain text. You can select multiple files.
          </span>
          <input
            type="file"
            name="files"
            multiple
            accept=".pdf,.doc,.docx,.txt,.md,.rtf"
            className="mt-1 block w-full rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
        <SubmitButton disabled={pending}>
          {pending ? "Rebuilding…" : "Add material and rebuild"}
        </SubmitButton>
        {state ? (
          <p
            role="status"
            className={
              state.ok ? "text-sm text-success" : "text-sm text-danger"
            }
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
