import { consultationConfig } from "@/lib/product-config/consultation";

export const applicationSummaryConfig = Object.freeze({
  title: "Application Summary",
  description: "Interview cheat sheet",
  actions: {
    generate: "Generate summary",
    regenerate: "Regenerate summary",
    retry: "Retry summary",
    print: "Print or Save as PDF",
  },
  sections: {
    company: "Company",
    position: "Position",
    strengths: "Where you shine",
    gaps: "Gaps and how to handle them",
    hiringTeam: "Hiring Team at a glance",
    guidance: `${consultationConfig.displayName}'s guidance`,
    stories: "Your stories",
  },
  cultureEvidenceLabel: "Based on limited public evidence",
});
