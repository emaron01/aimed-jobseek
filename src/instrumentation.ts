import { assertBrandDeploymentConfig } from "@/lib/product-config/deployment";

/**
 * Production server boot: fail loudly when required brand env is missing.
 * Skipped during `next build` so CI can compile without production secrets.
 */
export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production") return;
  assertBrandDeploymentConfig();
}
