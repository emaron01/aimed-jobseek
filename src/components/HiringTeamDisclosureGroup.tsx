"use client";

import { useRef, type ReactNode } from "react";
import { hiringTeamConfig } from "@/lib/product-config";

export function HiringTeamDisclosureGroup({
  groupKey,
  title,
  children,
}: {
  groupKey: "direct" | "indirect";
  title: string;
  children: ReactNode;
}) {
  const groupRef = useRef<HTMLDivElement>(null);

  function setAll(open: boolean) {
    groupRef.current?.querySelectorAll("details").forEach((details) => {
      details.open = open;
    });
  }

  return (
    <section
      className="space-y-3"
      data-testid={`hiring-team-${groupKey}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            className="text-xs font-medium text-slate-700 underline"
            onClick={() => setAll(true)}
            data-testid={`expand-all-${groupKey}`}
          >
            {hiringTeamConfig.controls.expandAll}
          </button>
          <button
            type="button"
            className="text-xs font-medium text-slate-700 underline"
            onClick={() => setAll(false)}
            data-testid={`collapse-all-${groupKey}`}
          >
            {hiringTeamConfig.controls.collapseAll}
          </button>
        </div>
      </div>
      <div ref={groupRef} className="space-y-3">
        {children}
      </div>
    </section>
  );
}
