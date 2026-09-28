import type { JobScorecard } from "@/lib/job-requirement/types";

/**
 * Parsed Senior Director of Sales - North America (CSC) posting items from the
 * local development database (campaign job with the "most valuable digital brands"
 * mission). Used as the permanent Batch C FIX 5 fixture.
 */
export const cscSeniorDirectorSalesParsed = {
  title: "Senior Director of Sales",
  responsibilities: [
    "Lead and grow a channel and partner sales motion alongside direct enterprise selling",
    "Sell digital brand protection, domain, and digital-risk services to enterprise buyers",
    "Build a front-line sales manager bench and a disciplined weekly forecast cadence",
    "Hire and develop front-line sales managers and raise execution quality",
    "Open new logos and expand existing accounts using MEDDIC",
  ],
  requiredItems: [
    "10+ years of progressive sales leadership",
    "Experience building and developing front-line sales managers",
    "Proven MEDDIC methodology and weekly forecast cadence",
    "Experience leading a channel and partner sales motion",
    "Experience selling digital brand protection, domain, or digital-risk services to enterprise buyers",
    "Track record opening new logos and expanding renewals",
  ],
  preferredItems: [] as string[],
  scorecard: {
    mission: {
      id: "mission:csc",
      text: "Join us to help protect the world's most valuable digital brands while building a disciplined, world-class sales organization defined by execution excellence, leadership depth, and sustainable growth.",
      inferred: false,
    },
    outcomes: [
      {
        id: "outcome:channel",
        text: "Lead and grow a channel and partner sales motion",
        inferred: false,
      },
      {
        id: "outcome:domain",
        text: "Sell digital brand protection and domain services to enterprise buyers",
        inferred: false,
      },
    ],
    competencies: [
      {
        id: "competency:bench",
        text: "Build a front-line sales manager bench and a disciplined forecast cadence",
        inferred: false,
      },
    ],
  } satisfies JobScorecard,
  /** Extra real requirement/outcome examples that must never be treated as pitch. */
  additionalKeptExamples: [
    "Deliver North America revenue targets across expansion and new logo acquisition.",
    "Build and operationalize a repeatable, scalable sales process.",
  ],
} as const;
