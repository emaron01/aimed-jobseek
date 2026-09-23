import { referralShareMessage as formatReferralShareMessage } from "@/lib/product-config";
import { getBrandDeployment } from "@/lib/product-config/deployment";

/**
 * Suggested referral share text — the user may rewrite before copying.
 */
export function referralShareMessage(code: string): string {
  const { marketingDomain } = getBrandDeployment();
  return formatReferralShareMessage({ code, marketingDomain });
}
