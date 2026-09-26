import type { Metadata } from "next";
import { requireApplicationWorkspace } from "@/lib/application/workspace-access";
import {
  applicationPageTitle,
  applicationStepByKey,
  applicationStepCopy,
  brand,
  type ApplicationStepKey,
} from "@/lib/product-config";

export async function generateApplicationPageMetadata(
  campaignId: string,
  step: ApplicationStepKey | "overview",
): Promise<Metadata> {
  const access = await requireApplicationWorkspace(campaignId);
  if (access.kind === "missing-tenant") {
    return { title: brand.defaultPageTitle };
  }
  const page =
    step === "overview"
      ? applicationStepCopy.overviewTitle
      : applicationStepByKey(step).title;
  return {
    title: {
      absolute: applicationPageTitle(page, access.campaignName),
    },
  };
}
