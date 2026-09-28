import type { HiringTeamDraftFields } from "@/lib/hiring-team/draft-quality";

/**
 * Real built "Executive Leadership" persona for Senior Director of Sales -
 * North America at CSC. Used to validate assessHiringTeamDraft against a
 * complete seeker-facing narrative.
 */
export const cscExecutiveLeadershipWhyIdentified = [
  "The role owns North America revenue targets across expansion and new-logo acquisition.",
  "CSC offers digital brand and cyber-risk services, including DNS management, digital-brand protection, and fraud protection.",
  "The role is responsible for building a disciplined, world-class sales organization and sustainable growth.",
] as const;

export const cscExecutiveLeadershipDraftFields: HiringTeamDraftFields = {
  overview:
    "This leader turns CSC's North America sales strategy into a measurable operating system: clear account priorities, consistent deal inspection, usable CRM data, and a forecast that executives can act on. Their desk is where pipeline health, methodology adoption, seller productivity, expansion visibility, and manager operating discipline come together across domain security, digital brand protection, and related cyber-risk services.",
  impact:
    "A strong Senior Director of Sales would give this leader cleaner pipeline inputs, more credible forecast calls, and better manager-level adherence to qualification and inspection standards. That reduces the time spent reconciling conflicting deal views and lets Revenue Operations focus on improving conversion, coverage, seller productivity, and expansion visibility across CSC's North America business.",
  pressures: [
    "CSC sells a broad set of technology-enabled and managed services, so this leader must help sales teams separate attractive activity from qualified demand in complex enterprise buying cycles.",
    "The North America sales organization is expected to grow both new-logo revenue and expansion revenue without losing control of forecast quality or seller focus.",
    "Digital brand protection and domain-security opportunities may involve security, legal, marketing, procurement, and risk stakeholders, making stage progression and deal qualification difficult to standardize.",
    "Leadership needs a repeatable commercial cadence that works across CSC's established service businesses and evolving cyber-risk offerings.",
    "A hybrid, distributed organization increases the importance of shared definitions, timely CRM updates, and operating routines that do not depend on hallway visibility.",
  ],
  needs: [
    "In the first month, establish a shared view of North America pipeline health, forecast risk, account coverage, and expansion visibility with the Revenue Operations leader.",
    "Make deal reviews more evidence-based by consistently documenting qualification, stakeholder access, business impact, next steps, and reasons for stage movement.",
    "Create a dependable working rhythm with managers for pipeline inspection, forecast updates, and rapid escalation of stalled or strategically important opportunities.",
    "Improve CRM signal quality by adopting the agreed fields, stages, and inspection habits rather than creating parallel spreadsheets or informal forecasts.",
    "Identify the largest gaps between reported pipeline and likely revenue across new-logo and expansion motions, then act on those gaps with specific manager and seller interventions.",
    "Demonstrate measurable progress in coverage, forecast confidence, qualification quality, or cycle-time reduction within the first operating quarter.",
  ],
  concerns: [
    "Can this person operate within a metrics-driven cadence when the data exposes weaknesses in their team or individual deals?",
    "Will they treat CRM updates and qualification evidence as part of selling discipline, or delegate them as back-office administration?",
    "Do they understand complex cyber-risk and digital-brand buying committees well enough to distinguish real progress from polite stakeholder activity?",
    "Can they coach frontline managers to change behavior, or do they depend on Revenue Operations to enforce process from outside the sales team?",
    "Will they balance the urgency of new-logo pursuits with disciplined expansion planning across CSC's established customer base?",
    "Can they explain business impact from operating changes rather than listing activity, training delivered, or tools implemented?",
  ],
  interviewStage: "hiring manager chronological walk-through",
  evaluates: [
    "How the candidate has built and sustained forecast discipline in complex enterprise sales environments.",
    "Whether the candidate can apply MEDDIC or a similar methodology through real manager and seller behavior.",
    "Evidence of improving pipeline coverage, win rates, cycle time, quota attainment, seller productivity, or retention.",
    "Ability to work with Revenue Operations on CRM adoption, data quality, definitions, and operating cadence.",
    "Judgment in balancing new-logo acquisition, customer expansion, account prioritization, and cross-functional dependencies.",
    "The candidate's ability to make risks visible early and respond constructively to inspection and performance data.",
  ],
  talkingPoints: [
    "Explain how you established one definition of a qualified opportunity and made managers use it in weekly deal reviews.",
    "Describe a forecast that was unreliable, the signals you found beneath the reported number, and the operating changes that improved accuracy.",
    "Show how you used account segmentation or ICP analysis to redirect seller time toward high-value enterprise opportunities rather than simply increasing activity.",
    "Give an example of making MEDDIC or a comparable framework useful in live deal coaching, including what evidence you required before advancing a stage.",
    "Discuss how you partnered with frontline managers to improve CRM adoption without turning the process into an administrative exercise.",
    "Connect seller productivity, retention, quota attainment, and expansion outcomes to the specific leading indicators you monitored.",
    "Explain how you would work day to day with Revenue Operations: agree on definitions, inspect evidence, close data gaps, and turn findings into manager actions.",
  ],
  communication: [
    "Lead with specific operating examples and measurable before-and-after outcomes rather than broad claims about leadership.",
    "Be candid about forecast misses, adoption resistance, or process failures and explain the corrective actions taken.",
    "Use the language of evidence: what was in the CRM, what changed in the forecast, which behavior changed, and what result followed.",
    "Explain collaboration with Revenue Operations as a working partnership involving shared definitions, recurring inspections, and rapid feedback loops.",
    "Keep answers structured and concise enough to map to an operating review, while showing the judgment behind the metrics.",
  ],
};

/** Job lines from the Senior Director of Sales - North America posting at CSC. */
export const cscSeniorDirectorSalesJobLines = [
  "Senior Director of Sales - North America",
  "CSC",
  "Own North America new-logo and expansion revenue",
  "Build a disciplined world-class sales organization",
  "DNS management, digital brand protection, and fraud protection",
  "Partner with Revenue Operations on CRM and forecast quality",
  "Apply MEDDIC or equivalent qualification methodology",
  "Coach frontline sales managers on pipeline inspection",
] as const;
