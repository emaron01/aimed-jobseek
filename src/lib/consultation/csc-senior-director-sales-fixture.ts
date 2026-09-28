import type { JobScorecard } from "@/lib/job-requirement/types";

/**
 * Real CSC Global "Senior Director of Sales - North America" posting items
 * (Batch C pitch-filter fixture). Responsibilities are listed for pitch checks;
 * evidenceTargets uses required + scorecard only.
 */
export const cscSeniorDirectorSalesParsed = {
  title: "Senior Director of Sales - North America",
  responsibilities: [
    "Own and deliver North America revenue targets across expansion and new logo acquisition",
    "Build and operationalize a repeatable, scalable sales process aligned to domain security, digital brand protection cybersecurity buying motions",
    "Establish ICP-based account segmentation and prioritization focused on high-risk, high-value digital brands",
    "Develop and coach front-line sales managers to be exceptional people leaders, deal coaches, and performance multipliers",
    "Directly mentor and develop Account Executives and hunters to improve discovery, qualification, deal strategy, and close rates",
    "Implement structured qualification and deal management frameworks (MEDDIC or equivalent)",
    "Drive disciplined pipeline management, forecast accuracy, and CRM adoption",
    "Establish clear performance expectations supported by leading and lagging indicators (pipeline coverage, win rates, cycle time, expansion penetration)",
    "Lead structured operating rhythms including weekly pipeline reviews, deal inspections, and quarterly business reviews",
    "Build enablement programs that continuously elevate sales effectiveness and product fluency",
    "Partner cross-functionally with Marketing, Customer Success, Product, and Channel to optimize demand generation and customer expansion",
    "Position domain and brand protection solutions as mission-critical controls within enterprise risk and security strategies",
  ],
  requiredItems: [
    "10+ years of progressive sales leadership experience, preferrable in cybersecurity, domain security, SaaS, or digital risk services",
    "Proven success scaling high-performance teams across expansion and new logo motions",
    "Demonstrated experience building strong front-line management layers and developing elite sales talent",
    "Deep expertise in MEDDIC or similar enterprise sales methodologies",
    "Strong background in metrics-driven performance management and forecast discipline",
    "Track record of improving seller productivity, retention, and quota attainment",
    "Experience selling complex, consultative solutions into mid-market and enterprise organizations",
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
        id: "outcome:revenue",
        text: "Deliver North America revenue targets across expansion and new logo acquisition.",
        inferred: false,
      },
      {
        id: "outcome:process",
        text: "Build and operationalize a repeatable, scalable sales process.",
        inferred: false,
      },
      {
        id: "outcome:productivity",
        text: "Improve seller productivity, retention, and quota attainment.",
        inferred: false,
      },
      {
        id: "outcome:forecast",
        text: "Drive forecast accuracy, pipeline coverage, win rates, cycle time, and expansion penetration.",
        inferred: false,
      },
      {
        id: "outcome:mission-echo",
        text: "Build a disciplined, world-class sales organization defined by execution excellence, leadership depth, and sustainable growth.",
        inferred: false,
      },
    ],
    competencies: [
      {
        id: "competency:years",
        text: "10+ years of progressive sales leadership experience, preferably in cybersecurity, domain security, SaaS, or digital risk services.",
        inferred: false,
      },
      {
        id: "competency:scale",
        text: "Proven success scaling high-performance teams across expansion and new logo motions.",
        inferred: false,
      },
      {
        id: "competency:bench",
        text: "Experience building strong front-line management layers and developing elite sales talent.",
        inferred: false,
      },
      {
        id: "competency:meddic",
        text: "Deep expertise in MEDDIC or similar enterprise sales methodologies.",
        inferred: false,
      },
      {
        id: "competency:metrics",
        text: "Strong background in metrics-driven performance management and forecast discipline.",
        inferred: false,
      },
      {
        id: "competency:enterprise",
        text: "Experience selling complex, consultative solutions into mid-market and enterprise organizations.",
        inferred: false,
      },
    ],
  } satisfies JobScorecard,
} as const;
