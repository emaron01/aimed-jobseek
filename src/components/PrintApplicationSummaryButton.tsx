"use client";

import { SECONDARY_BUTTON_CLASS } from "@/components/ui";
import { applicationSummaryConfig } from "@/lib/product-config";

export function PrintApplicationSummaryButton() {
  return (
    <button
      type="button"
      className={`${SECONDARY_BUTTON_CLASS} print:hidden`}
      onClick={() => window.print()}
    >
      {applicationSummaryConfig.actions.print}
    </button>
  );
}
