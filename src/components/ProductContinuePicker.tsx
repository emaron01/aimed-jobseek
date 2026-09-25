"use client";
import { PRIMARY_BUTTON_CLASS, AppButton } from "@/components/ui";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { vocab } from "@/lib/product-config";

/** Substitute in `continuePathTemplate` (e.g. `/setup/{productId}/icps/new`). */
export const PRODUCT_CONTINUE_PATH_PRODUCT_ID = "{productId}";

export function buildProductContinuePath(
  template: string,
  productId: string,
): string {
  return template.replaceAll(PRODUCT_CONTINUE_PATH_PRODUCT_ID, productId);
}

export function ProductContinuePicker({
  products,
  initialProductId,
  continuePathTemplate,
  continueLabel,
}: {
  products: Array<{ id: string; name: string }>;
  initialProductId: string | null;
  /** Path with `{productId}` placeholder — must be serializable from Server Components. */
  continuePathTemplate: string;
  continueLabel: string;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(
    initialProductId ?? (products.length === 1 ? products[0]!.id : ""),
  );
  if (!productId) {
    const next = initialProductId ?? (products.length === 1 ? products[0]!.id : "");
    if (next) setProductId(next);
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm text-slate-700">
        <span className="mb-2 block font-medium text-slate-900">{vocab.product.Singular}</span>
        <select
          className="w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
        >
          <option value="">Select {vocab.product.aSingular}</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </label>
      <AppButton
        type="button"
        disabled={!productId}
        onClick={() => {
          if (!productId) return;
          router.push(buildProductContinuePath(continuePathTemplate, productId));
        }}
        className={PRIMARY_BUTTON_CLASS}
      >
        {continueLabel}
      </AppButton>
    </div>
  );
}
