"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@prisma/client";
import { upsertProductAction } from "@/app/actions";
import { Field, SubmitButton } from "@/components/ui";
import type { ProductActionResult, ProductFormValues } from "@/lib/product/save";
import { productNameDomainMismatchWarning } from "@/lib/setup/product-overview";
import { vocab } from "@/lib/product-config";

const initial: ProductActionResult | null = null;

function defaultsFromProduct(product: Product): ProductFormValues {
  return {
    id: product.id,
    name: product.name,
    description: product.description ?? "",
    valueProposition: product.valueProposition ?? "",
    averageOrderValue:
      product.averageOrderValue != null
        ? String(Number(product.averageOrderValue))
        : "",
    websiteUrl: product.websiteUrl ?? "",
  };
}

/** Existing product edit form — useActionState for save feedback. */
export function ProductDetailsForm({ product }: { product: Product }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    upsertProductAction,
    initial,
  );

  const restored = state && !state.ok ? state.values : undefined;
  const defaults = useMemo(
    () => ({ ...defaultsFromProduct(product), ...restored }),
    [product, restored],
  );
  const formKey =
    state && !state.ok
      ? `product-fail-${state.message}-${defaults.name.slice(0, 24)}`
      : `product-${product.id}`;

  const [name, setName] = useState(defaults.name);
  const [websiteUrl, setWebsiteUrl] = useState(defaults.websiteUrl);
  const [defaultsKey, setDefaultsKey] = useState(
    `${defaults.name}\0${defaults.websiteUrl}`,
  );
  const nextDefaultsKey = `${defaults.name}\0${defaults.websiteUrl}`;
  if (nextDefaultsKey !== defaultsKey) {
    setDefaultsKey(nextDefaultsKey);
    setName(defaults.name);
    setWebsiteUrl(defaults.websiteUrl);
  }
  const warning = productNameDomainMismatchWarning(name, websiteUrl);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  function fieldHint(key: keyof ProductFormValues): string | undefined {
    if (!state || state.ok) return undefined;
    return state.fieldErrors?.[key];
  }

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid gap-4 md:grid-cols-2"
      data-testid="product-details-form"
    >
      {state ? (
        <p
          role="status"
          data-testid="product-action-status"
          className={
            state.ok
              ? "md:col-span-2 text-sm text-emerald-700"
              : "md:col-span-2 text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      ) : null}
      <input type="hidden" name="id" value={product.id} />
      <label className="block text-sm">
        <span className="font-medium text-slate-700">{vocab.product.Singular} Name</span>
        <input
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 focus:ring-2"
        />
        {fieldHint("name") ? (
          <span className="mt-1 block text-xs text-red-600">
            {fieldHint("name")}
          </span>
        ) : null}
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Website URL</span>
        <input
          name="websiteUrl"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2"
        />
      </label>
      {warning ? (
        <p
          role="status"
          data-testid="product-name-domain-warning"
          className="md:col-span-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          {warning}
        </p>
      ) : null}
      <div className="md:col-span-2">
        <Field
          label={`${vocab.product.Singular} Description`}
          name="description"
          defaultValue={defaults.description}
          as="textarea"
        />
      </div>
      <div className="md:col-span-2">
        <Field
          label={`Primary ${vocab.valueProposition.TitleSingular}`}
          name="valueProposition"
          defaultValue={defaults.valueProposition}
          as="textarea"
        />
      </div>
      <Field
        label="Typical Price / AOV"
        name="averageOrderValue"
        type="number"
        defaultValue={defaults.averageOrderValue}
        hint={fieldHint("averageOrderValue")}
      />
      <div className="flex items-end">
        <SubmitButton disabled={pending}>
          {pending ? "Saving…" : `Save ${vocab.product.singular}`}
        </SubmitButton>
      </div>
    </form>
  );
}
