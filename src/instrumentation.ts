import {
  assertAssetAiConfigured,
  assertConsultationAiConfigured,
  assertConsultationReplyAiConfigured,
  assertPersonaAiConfigured,
} from "@/lib/ai/config";
import { assertBrandDeploymentConfig } from "@/lib/product-config/deployment";

/**
 * Production server boot: fail loudly when required brand, consultation,
 * or asset AI env is missing. Persona AI missing is logged only (never
 * stops boot). Skipped during `next build` so CI can compile without
 * production secrets.
 */
export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production") return;
  assertBrandDeploymentConfig();
  assertConsultationAiConfigured();
  assertConsultationReplyAiConfigured();
  assertAssetAiConfigured();
  assertPersonaAiConfigured();
}
