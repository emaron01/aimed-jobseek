"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { vocab } from "@/lib/product-config";

export function ArtifactProductFilter({
  products,
  selectedProductId,
}: {
  products: Array<{ id: string; name: string }>;
  selectedProductId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
      <span className="font-medium text-slate-900">{vocab.product.Singular}</span>
      <select
        className="min-w-[12rem] rounded-md border border-slate-300 bg-white px-3 py-2"
        value={selectedProductId ?? ""}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          const value = event.target.value;
          if (value) next.set("product", value);
          else next.delete("product");
          const query = next.toString();
          router.push(query ? `${pathname}?${query}` : pathname);
        }}
      >
        <option value="">All {vocab.product.plural}</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name}
          </option>
        ))}
      </select>
    </label>
  );
}
