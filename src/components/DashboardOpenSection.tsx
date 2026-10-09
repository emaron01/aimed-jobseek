"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Opens the step's outer sections inside a dashboard panel.
 * A details element nested in another details keeps its own collapsed default.
 * Every current and later panel is wrapped with this once, in ApplicationStepCards.
 */
export function expandOuterDetails(root: ParentNode) {
  for (const details of root.querySelectorAll("details")) {
    if (details.parentElement?.closest("details")) continue;
    details.open = true;
  }
}

export function DashboardOpenSection({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) expandOuterDetails(ref.current);
  }, []);
  return (
    <div ref={ref} data-expand-outer-section="">
      {children}
    </div>
  );
}
