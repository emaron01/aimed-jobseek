import { notFound } from "next/navigation";
import { TenantError } from "@/lib/tenant/errors";
import {
  anyListFeatureEnabled,
  features,
  type FeatureFlag,
} from "@/lib/product-config/features";

export const FEATURE_UNAVAILABLE = "This feature is not available.";

export class FeatureDisabledError extends TenantError {
  constructor() {
    super(FEATURE_UNAVAILABLE);
    this.name = "FeatureDisabledError";
  }
}

export type GatedSurface =
  | "lists"
  | "listImport"
  | "listBulkValidation"
  | "listBulkScoring"
  | "legacyEmailSequence"
  | "emailConnection"
  | "productLevelHiringTeam";

export function isGatedSurfaceEnabled(
  surface: GatedSurface,
  flags: Readonly<Record<FeatureFlag, boolean>> = features,
): boolean {
  switch (surface) {
    case "lists":
      return anyListFeatureEnabled(flags);
    case "listImport":
      return flags.listImport;
    case "listBulkValidation":
      return flags.listBulkValidation;
    case "listBulkScoring":
      return flags.listBulkScoring;
    case "legacyEmailSequence":
      return flags.legacyEmailSequence;
    case "emailConnection":
      return flags.emailConnection;
    case "productLevelHiringTeam":
      return flags.productLevelHiringTeam;
  }
}

/** Pages of a disabled feature render as not found. */
export function requireGatedPage(surface: GatedSurface): void {
  if (!isGatedSurfaceEnabled(surface)) {
    notFound();
  }
}

/** Server actions of a disabled feature return a forbidden TenantError. */
export function assertGatedAction(surface: GatedSurface): void {
  if (!isGatedSurfaceEnabled(surface)) {
    throw new FeatureDisabledError();
  }
}
