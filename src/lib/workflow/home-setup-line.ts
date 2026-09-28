import {
  PRODUCT_READINESS_BLOCKERS,
  type ProductCampaignReadiness,
} from "@/lib/workflow/product-campaign-readiness";
import { countedNoun, vocab } from "@/lib/product-config";
import { isGatedSurfaceEnabled } from "@/lib/product-config/feature-access";

export function formatProductSetupClause(
  productName: string,
  readiness: ProductCampaignReadiness,
): string {
  if (readiness.ready) return `${productName} ready`;

  const blocker = readiness.blockers[0] ?? "needs setup";
  if (
    blocker === PRODUCT_READINESS_BLOCKERS.needsReview ||
    blocker === PRODUCT_READINESS_BLOCKERS.draft ||
    blocker === PRODUCT_READINESS_BLOCKERS.notApproved
  ) {
    return `${productName} needs approval`;
  }
  if (blocker === PRODUCT_READINESS_BLOCKERS.notStarted) {
    return `${productName} needs ${vocab.product.singular} setup`;
  }
  return `${productName} needs setup`;
}

export function buildHomeSetupLine(input: {
  products: Array<{ name: string; readiness: ProductCampaignReadiness }>;
  totalIcps: number;
  totalPersonas: number;
}): { text: string; href: string | null } {
  if (input.products.length === 0) {
    return {
      text: `No ${vocab.product.plural} yet. Add ${vocab.product.aSingular} to start setup.`,
      href: "/setup/new",
    };
  }

  const allReady = input.products.every((product) => product.readiness.ready);
  if (allReady) {
    const productCount = input.products.length;
    const personaCount = input.totalPersonas;
    const parts = [
      `Setup complete · ${countedNoun(productCount, vocab.product)}`,
    ];
    if (isGatedSurfaceEnabled("employerIcpFit")) {
      parts.push(countedNoun(input.totalIcps, vocab.icp));
    }
    parts.push(countedNoun(personaCount, vocab.persona));
    return {
      text: parts.join(" · "),
      href: "/products",
    };
  }

  return {
    text: input.products
      .map((product) =>
        formatProductSetupClause(product.name, product.readiness),
      )
      .join(" · "),
    href: "/products",
  };
}
