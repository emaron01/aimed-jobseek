import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui";
import Link from "next/link";
import { deleteProductAction } from "@/app/actions";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import type { ProductWithCounts } from "@/lib/tenant/data";
import { countedNoun, vocab } from "@/lib/product-config";


export function ProductCatalogPanel({
  products,
  deleteSuccessNavigate = "/products",
}: {
  products: ProductWithCounts[];
  deleteSuccessNavigate?: string;
}) {
  return (
    <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
      {products.map((product) => (
        <div
          key={product.id}
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
        >
          <div>
            <p className="font-medium text-slate-900">{product.name}</p>
            <p className="mt-1 text-sm text-slate-600">
              {product.approvalStatus.replaceAll("_", " ")} ·{" "}
              {countedNoun(product._count.icps, vocab.icp)} ·{" "}
              {product._count.personas}{" "}
              {product._count.personas === 1
                ? vocab.persona.Singular
                : vocab.persona.Plural}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/setup/${product.id}/research`}
              className={SECONDARY_BUTTON_CLASS}
            >
              Research
            </Link>
            <Link
              href={`/setup/${product.id}`}
              className={PRIMARY_BUTTON_CLASS}
            >
              Manage
            </Link>
            <ConfirmDeleteForm
              action={deleteProductAction}
              hiddenFields={{ id: product.id }}
              triggerLabel="Delete"
              confirmTitle={`Delete ${vocab.product.Singular} "${product.name}"?`}
              confirmBody={`This will remove this ${vocab.product.Singular} and its ${vocab.icp.plural} (${product._count.icps}), ${vocab.persona.Plural} (${product._count.personas}), and ${vocab.product.singular} research sources/drafts.\n${vocab.campaign.Plural} (${product._count.campaigns}) must be removed first if any exist.\nHistorical scoring snapshots will not be destroyed — the ${vocab.product.Singular} may be archived instead if scoring runs reference it.`}
              confirmButtonLabel={`Delete ${vocab.product.Singular}`}
              onSuccessNavigate={deleteSuccessNavigate}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
