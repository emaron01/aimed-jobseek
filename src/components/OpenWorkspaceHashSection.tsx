"use client";

import { useEffect } from "react";
import { openWorkspaceSection } from "@/lib/application/workspace-links";

export function OpenWorkspaceHashSection({
  sectionId,
}: {
  sectionId: string;
}) {
  useEffect(() => {
    function openIfHashed() {
      if (window.location.hash !== `#${sectionId}`) return;
      openWorkspaceSection(sectionId);
    }
    openIfHashed();
    window.addEventListener("hashchange", openIfHashed);
    return () => window.removeEventListener("hashchange", openIfHashed);
  }, [sectionId]);
  return null;
}
