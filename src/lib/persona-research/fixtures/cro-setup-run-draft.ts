/**
 * Production CRO persona draft from PersonaSetupRun cmt4hadug000flp2o2b44e6zb (Aug 2026).
 * Raw draft.criteria incorrectly sets isDisqualifier: true on must-have rows.
 */
import type { PersonaAiDraft } from "@/lib/persona-research/contract";

export const CRO_PERSONA_SETUP_RUN_ID = "cmt4hadug000flp2o2b44e6zb";

export const CRO_PERSONA_DRAFT_FIXTURE = {
  "name": "Chief Revenue Officer",
  "criteria": [
    {
      "name": "Owns revenue forecast governance",
      "operator": "equals",
      "importance": "CRITICAL",
      "isRequired": true,
      "description": "Role has direct accountability for revenue forecasting, commit confidence, or forecast predictability.",
      "targetValue": true,
      "criterionType": "responsibility",
      "isDisqualifier": true,
      "researchGuidance": "Verify through role scope, executive responsibilities, or ownership of forecast reviews."
    },
    {
      "name": "Leads a B2B sales organization",
      "operator": "equals",
      "importance": "CRITICAL",
      "isRequired": true,
      "description": "Role oversees an active B2B sales function that conducts recurring forecast reviews.",
      "targetValue": true,
      "criterionType": "organizational_context",
      "isDisqualifier": true,
      "researchGuidance": "Confirm sales motion, team structure, and recurring forecast-call process."
    },
    {
      "name": "Accountable for revenue predictability",
      "operator": "equals",
      "importance": "HIGH",
      "isRequired": true,
      "description": "Role is measured on the reliability, confidence, or executive usability of revenue forecasts.",
      "targetValue": true,
      "criterionType": "accountability",
      "isDisqualifier": false,
      "researchGuidance": "Look for explicit ownership of revenue planning, forecast accuracy, or board-level revenue reporting."
    },
    {
      "name": "Experiences unsupported commits or weak deal evidence",
      "operator": "equals",
      "importance": "HIGH",
      "isRequired": false,
      "description": "Forecast commitments may not be supported by buyer-verified evidence, qualification data, or buying signals.",
      "targetValue": true,
      "criterionType": "pain_point",
      "isDisqualifier": false,
      "researchGuidance": "Assess examples of late-stage risk, forecast misses, or CRM stages diverging from deal reality."
    },
    {
      "name": "Needs executive visibility into deal risk",
      "operator": "equals",
      "importance": "HIGH",
      "isRequired": false,
      "description": "Role needs continuous visibility into commit health, forecast risk, qualification gaps, and coaching priorities.",
      "targetValue": true,
      "criterionType": "desired_outcome",
      "isDisqualifier": false,
      "researchGuidance": "Confirm current dashboard, inspection, and executive reporting gaps."
    },
    {
      "name": "Uses CRM or structured deal data",
      "operator": "in",
      "importance": "MEDIUM",
      "isRequired": false,
      "description": "Organization can provide Salesforce, HubSpot, Microsoft Dynamics, or Excel-based deal data for the workflow.",
      "targetValue": [
        "Salesforce",
        "HubSpot",
        "Microsoft Dynamics",
        "Excel"
      ],
      "criterionType": "technical_context",
      "isDisqualifier": false,
      "researchGuidance": "Confirm system of record, data accessibility, and required integration depth."
    }
  ],
  "seniority": "C-level / executive",
  "buyingRole": "Economic buyer or executive sponsor for revenue-forecast governance initiatives; exact purchasing authority is not established by the provided evidence.",
  "confidence": "HIGH",
  "painPoints": [
    "CRM forecast stages may not reflect the evidence supporting a deal",
    "Unsupported commits and qualification gaps can remain hidden until late in the sales cycle",
    "Forecast calls can consume time collecting rep updates instead of coaching deals",
    "Limited continuous visibility into deal evidence, risk, and coaching priorities",
    "Inconsistent sales methodologies can make deal inspection difficult"
  ],
  "roleSummary": "Executive leader accountable for revenue predictability, forecast confidence, sales execution, and the performance of the revenue organization. This role is relevant when forecast calls rely heavily on seller-reported optimism and leadership needs earlier visibility into unsupported commits, deal risk, and coaching priorities.",
  "terminology": [
    "forecast governance",
    "deal evidence",
    "unsupported commits",
    "qualification gaps",
    "commit health",
    "forecast risk",
    "AI-led deal reviews",
    "coaching opportunities",
    "executive dashboard",
    "Matthew",
    "AI Sales Leader Assistant",
    "forecast analytics",
    "revenue intelligence"
  ],
  "evidenceRefs": [
    {
      "note": "Role definition supplied in the user context; the specific accountability framing is also supported by disciplined role reasoning.",
      "claim": "The selected buyer role is responsible for executive revenue leadership and is described as owning forecast confidence, revenue predictability, and sales execution.",
      "sourceIds": [],
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE",
        "MODEL_INFERENCE"
      ]
    },
    {
      "note": null,
      "claim": "ForecastWorks.io is positioned to identify unsupported commits, validate deal evidence, surface qualification gaps, and provide executive forecast visibility.",
      "sourceIds": [
        "cmt3d2a6x000npr2op7op6q2m"
      ],
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE"
      ]
    },
    {
      "note": null,
      "claim": "The product is intended to help leaders spend less time collecting rep updates in forecast calls and more time coaching deals.",
      "sourceIds": [
        "cmt3d2a6x000npr2op7op6q2m"
      ],
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE"
      ]
    },
    {
      "note": "These are disciplined inferences about typical executive revenue-leadership accountability, not customer-researched facts.",
      "claim": "The CRO's likely KPIs include forecast predictability, commit health, pipeline quality, and revenue attainment.",
      "sourceIds": [],
      "provenanceClasses": [
        "MODEL_INFERENCE"
      ]
    },
    {
      "note": "Buying-role and implementation-ownership assumptions are model inferences; no customer buying-process evidence was provided.",
      "claim": "A CRO may act as an economic buyer or executive sponsor, while implementation ownership may sit with Revenue Operations, Sales Operations, or Sales Enablement.",
      "sourceIds": [],
      "provenanceClasses": [
        "MODEL_INFERENCE"
      ]
    }
  ],
  "likelyTitles": [
    "Chief Revenue Officer",
    "Chief Sales Officer",
    "EVP Revenue"
  ],
  "messagingNotes": [
    "Lead with evidence-based forecast confidence rather than generic pipeline reporting.",
    "Frame Matthew as augmenting sales leadership by surfacing risk and coaching priorities, not replacing managers or RevOps.",
    "Connect the product to executive outcomes: earlier risk visibility, stronger commit inspection, and more coaching time.",
    "Use the distinction between CRM forecast stages and deal truth as a central problem framing.",
    "Avoid guaranteed forecast accuracy, proven revenue lift, or claims that forecast misses will be eliminated.",
    "Acknowledge that integration capabilities may differ by CRM and that published performance results were not provided."
  ],
  "ownershipAreas": [
    "Revenue forecast governance",
    "Commit accuracy and forecast confidence",
    "Sales pipeline and deal-risk visibility",
    "Sales-manager execution and coaching effectiveness",
    "Revenue performance reporting and executive decision-making"
  ],
  "likelyObjections": [
    "Concern about forecast data quality and whether AI-generated deal evidence is trustworthy",
    "Questions about integration depth and workflow differences across Salesforce, HubSpot, Microsoft Dynamics, and Excel upload",
    "Concern that reps or managers may resist AI-led deal reviews",
    "Need to understand how the platform complements existing RevOps, sales-management, and forecasting processes",
    "Demand for proof of forecast-accuracy, win-rate, or revenue impact, which is not established by the provided evidence",
    "Budget scrutiny for a new forecast-governance platform"
  ],
  "researchGuidance": [
    "Validate whether the CRO directly owns forecast governance or delegates it to Revenue Operations or Sales Operations.",
    "Determine team size, manager layers, sales motions, CRM environment, and forecast cadence.",
    "Confirm the current process for inspecting deal evidence and identifying unsupported commits.",
    "Assess whether the primary pain is forecast accuracy, manager capacity, qualification consistency, or executive visibility.",
    "Do not infer forecast-accuracy improvement, win-rate improvement, revenue impact, or time savings without customer evidence.",
    "Clarify purchasing authority, implementation ownership, security requirements, and integration expectations."
  ],
  "decisionInfluence": "High influence over business priority, budget, adoption expectations, and success criteria; implementation ownership may be delegated to Revenue Operations, Sales Operations, or Sales Enablement.",
  "departmentFunction": "Executive revenue leadership",
  "negativeRoleSignals": [
    "Role is focused primarily on marketing, finance, or customer success without sales-forecast ownership",
    "No recurring forecast-review process or active B2B sales organization",
    "Expectation that the platform should replace sales managers or RevOps teams",
    "Requirement for independently verified forecast-accuracy or revenue-lift results before evaluation",
    "No access to usable CRM deal records or structured deal data"
  ],
  "positiveRoleSignals": [
    "Direct ownership of revenue forecasting or commit governance",
    "Regular participation in executive forecast reviews",
    "Concern that CRM stages do not reliably represent deal truth",
    "Desire to identify weak commits before they miss",
    "Interest in converting forecast calls into coaching sessions",
    "Need for multi-manager rollups, executive dashboards, or expanded reporting",
    "Willingness to pilot a forecast-governance workflow with an existing CRM or Excel upload"
  ],
  "provenanceAssessments": [
    {
      "note": "The selected buyer-role context supports relevance; detailed KPI and responsibility expansion is inferred from the role.",
      "claim": "The CRO owns forecast confidence, revenue predictability, and sales execution.",
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE",
        "MODEL_INFERENCE"
      ]
    },
    {
      "note": "Supported by the approved product description and primary product evidence.",
      "claim": "The product addresses unsupported commits, qualification gaps, deal evidence, coaching priorities, and executive forecast visibility.",
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE"
      ]
    },
    {
      "note": "No direct purchasing or organizational evidence was provided.",
      "claim": "The CRO is likely an economic buyer or executive sponsor.",
      "provenanceClasses": [
        "MODEL_INFERENCE"
      ]
    },
    {
      "note": "The product evidence explicitly describes these problems; their prevalence for a specific CRO is inferred.",
      "claim": "The persona's pain points include status-collection-heavy forecast calls and limited continuous deal-risk visibility.",
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE",
        "MODEL_INFERENCE"
      ]
    }
  ],
  "proofPointsToEmphasize": [
    "The product site describes Matthew as an AI agent that interviews reps, validates deal evidence, flags unsupported commits, and surfaces coaching opportunities.",
    "The platform provides executive forecast dashboards, risk visibility, coaching intelligence, and evidence-backed insights.",
    "The platform is described as supporting Salesforce, HubSpot, Microsoft Dynamics, and Excel upload workflows, with capabilities varying by deployment path.",
    "A 30-day pilot program is offered.",
    "Starter pricing is published at $500 per month for up to 7 users."
  ],
  "kpisAndAccountabilities": [
    "Forecast confidence and predictability",
    "Commit health and unsupported-commit risk",
    "Revenue attainment against plan",
    "Pipeline quality and coverage",
    "Visibility into qualification gaps and late-stage deal risk",
    "Effectiveness of sales-manager coaching and forecast inspection"
  ],
  "organizationalPressures": [
    "Need to make executive revenue decisions using reliable forecast information",
    "Pressure to identify forecast risk before commits miss",
    "Limited leadership time for inspecting deal evidence across the organization",
    "Need to improve coaching leverage without adding proportional RevOps headcount",
    "Need to create consistency across managers, teams, and sales methodologies"
  ],
  "primaryResponsibilities": [
    "Own revenue forecasting and predictability",
    "Set and inspect sales execution standards",
    "Review forecast risk and commit health across teams",
    "Align sales leadership, revenue operations, and enablement around revenue performance",
    "Ensure managers address deal risk and qualification gaps before forecast misses"
  ],
  "personaSpecificPositioning": [
    "Position ForecastWorks.io as AI-powered forecast governance for revenue leaders who need to know which commits are real.",
    "Emphasize that Matthew challenges CRM forecast optimism against deal evidence, validates buying signals, and flags unsupported commits.",
    "Show how executive dashboards and continuous risk visibility can help leaders prioritize coaching before forecast meetings.",
    "For larger organizations, connect the platform to multi-manager rollups, expanded reporting, and broader revenue-governance needs without asserting undisclosed functionality."
  ],
  "desiredOutcomesFromSolution": [
    "More evidence-based confidence in revenue forecasts",
    "Earlier visibility into unsupported commits, deal risk, and qualification gaps",
    "Forecast calls that spend more time on coaching and less time collecting status updates",
    "Continuous executive visibility into commit health and forecast risk",
    "A consistent AI-led deal-review process across teams using MEDDPICC, another methodology, or no formal methodology",
    "Deployment through existing CRM workflows or Excel upload when CRM integration is not required"
  ]
} as PersonaAiDraft;
