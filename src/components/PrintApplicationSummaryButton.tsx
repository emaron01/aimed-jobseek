"use client";

import { AppButton } from "@/components/AppButton";
import { applicationSummaryConfig } from "@/lib/product-config";

export function PrintApplicationSummaryButton({
  sectionId,
}: {
  sectionId?: string;
}) {
  return (
    <AppButton
      type="button"
      variant="secondary"
      className="print:hidden"
      onClick={() => {
        if (!sectionId) {
          window.print();
          return;
        }
        const section = document.getElementById(sectionId);
        if (!section) {
          window.print();
          return;
        }
        document.body.setAttribute("data-print-section", sectionId);
        section.setAttribute("data-print-active", "true");
        const cleanup = () => {
          document.body.removeAttribute("data-print-section");
          section.removeAttribute("data-print-active");
          window.removeEventListener("afterprint", cleanup);
        };
        window.addEventListener("afterprint", cleanup);
        window.print();
      }}
    >
      {sectionId
        ? applicationSummaryConfig.actions.printSection
        : applicationSummaryConfig.actions.print}
    </AppButton>
  );
}
