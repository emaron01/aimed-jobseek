"use client";

import { createContext, useContext, type ReactNode } from "react";
import { AppActionLink, AppButton } from "@/components/AppButton";
import { applicationSummaryConfig } from "@/lib/product-config";

const CheatSheetPageLinkContext = createContext<string | null>(null);

/** On the dashboard panel, print controls link to the guides page. The page itself prints. */
export function CheatSheetPageLinkProvider({
  href,
  children,
}: {
  href: string | null;
  children: ReactNode;
}) {
  return (
    <CheatSheetPageLinkContext.Provider value={href}>
      {children}
    </CheatSheetPageLinkContext.Provider>
  );
}

export function PrintApplicationSummaryButton({
  sectionId,
}: {
  sectionId?: string;
}) {
  const pageHref = useContext(CheatSheetPageLinkContext);
  const label = sectionId
    ? applicationSummaryConfig.actions.printSection
    : applicationSummaryConfig.actions.print;
  if (pageHref) {
    const href = sectionId ? `${pageHref}#${sectionId}` : pageHref;
    return (
      <AppActionLink href={href} variant="secondary" className="print:hidden">
        {label}
      </AppActionLink>
    );
  }
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
      {label}
    </AppButton>
  );
}
