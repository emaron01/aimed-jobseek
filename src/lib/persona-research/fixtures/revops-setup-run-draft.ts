/**
 * Production Revenue Operations Leader draft from PersonaSetupRun cmt4kiemz000rqa3znhtexlk7 (Aug 2026).
 * negativeRoleSignals enriched with AI exclusionTestability as prompt v6 would emit;
 * two "without ownership of…" entries remain TITLE_TESTABLE from the AI so the
 * evidence-gap heuristic can be verified to override them.
 */
import type { PersonaAiDraft } from "@/lib/persona-research/contract";

export const REVOPS_PERSONA_SETUP_RUN_ID = "cmt4kiemz000rqa3znhtexlk7";

export const REVOPS_PERSONA_DRAFT_FIXTURE = {
  "name": "Revenue Operations Leader",
  "criteria": [
    {
      "name": "Forecast governance ownership",
      "operator": "equals_or_includes",
      "importance": "CRITICAL",
      "isRequired": true,
      "description": "Owns or materially influences the organization’s sales forecasting process, cadence, or governance.",
      "targetValue": true,
      "criterionType": "responsibility",
      "isDisqualifier": false,
      "researchGuidance": "Look for ownership of forecast process, commit definitions, forecast calls, or forecast methodology."
    },
    {
      "name": "Revenue operations scope",
      "operator": "equals_or_includes",
      "importance": "HIGH",
      "isRequired": true,
      "description": "Works in RevOps or an equivalent sales/revenue operations function.",
      "targetValue": "revenue operations",
      "criterionType": "function",
      "isDisqualifier": false,
      "researchGuidance": "Use responsibilities and reporting scope, not title alone."
    },
    {
      "name": "CRM and reporting ownership",
      "operator": "equals_or_includes",
      "importance": "HIGH",
      "isRequired": false,
      "description": "Owns or influences CRM workflows, revenue reporting, pipeline inspection, or executive dashboards.",
      "targetValue": true,
      "criterionType": "ownership",
      "isDisqualifier": false,
      "researchGuidance": "Confirm operational ownership beyond basic CRM administration."
    },
    {
      "name": "Executive risk visibility accountability",
      "operator": "equals_or_includes",
      "importance": "HIGH",
      "isRequired": false,
      "description": "Is accountable for communicating forecast risk, commit health, or pipeline confidence to revenue executives.",
      "targetValue": true,
      "criterionType": "accountability",
      "isDisqualifier": false,
      "researchGuidance": "Look for executive reporting, forecast-risk attribution, or business review responsibilities."
    },
    {
      "name": "Individual selling role only",
      "operator": "equals",
      "importance": "CRITICAL",
      "isRequired": false,
      "description": "Role is limited to selling individual opportunities and does not own revenue process or forecast governance.",
      "targetValue": true,
      "criterionType": "negative_scope",
      "isDisqualifier": true,
      "researchGuidance": "Exclude account executives and individual contributors without operational ownership."
    }
  ],
  "seniority": "Executive or senior functional leader",
  "buyingRole": "Champion, evaluator, and potential economic influencer for revenue operations and forecasting technology; final purchase authority may sit with the CRO, CEO, or finance leadership.",
  "confidence": "HIGH",
  "painPoints": [
    "CRM forecast stages may not reflect actual deal evidence.",
    "Unsupported Commit forecasts and qualification gaps can remain hidden until late in the sales cycle.",
    "Managers spend forecast time collecting status updates instead of coaching deals.",
    "Inconsistent sales processes make standardized deal inspection difficult.",
    "Executives may lack continuously updated visibility into deal risk and commit health."
  ],
  "roleSummary": "Owns the systems, processes, reporting, and governance that help revenue teams produce consistent, evidence-backed forecasts and actionable pipeline visibility.",
  "terminology": [
    "forecast governance",
    "deal evidence",
    "unsupported commits",
    "commit health",
    "qualification gaps",
    "AI-led deal review",
    "coaching opportunities",
    "executive risk visibility",
    "AI Sales Leader Assistant",
    "Matthew",
    "forecast calls",
    "evidence-backed forecasting"
  ],
  "evidenceRefs": [
    {
      "note": "Provided selectedBuyerRole context.",
      "claim": "The selected buyer role is Revenue Operations Leader, with likely titles including VP of Revenue Operations, Head of Revenue Operations, and Revenue Operations Director.",
      "sourceIds": [],
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE"
      ]
    },
    {
      "note": null,
      "claim": "ForecastWorks.io is designed for B2B teams that need stricter deal evidence without adding RevOps headcount.",
      "sourceIds": [
        "cmt3d2a6x000npr2op7op6q2m"
      ],
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE"
      ]
    },
    {
      "note": null,
      "claim": "The platform supports CRM integrations, executive dashboards, forecast analytics, gap attribution, and Excel upload.",
      "sourceIds": [
        "cmt3d2a6x000npr2op7op6q2m"
      ],
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE"
      ]
    },
    {
      "note": "Disciplined role inference, not customer-specific evidence.",
      "claim": "Revenue operations leaders typically govern forecasting processes, CRM workflows, reporting, and operational consistency.",
      "sourceIds": [],
      "provenanceClasses": [
        "MODEL_INFERENCE"
      ]
    }
  ],
  "likelyTitles": [
    "VP of Revenue Operations",
    "Head of Revenue Operations",
    "Revenue Operations Director"
  ],
  "messagingNotes": [
    "Position the product as governance and evidence validation, not autonomous forecasting or deal closing.",
    "Emphasize that Matthew challenges CRM-entered forecasts by interviewing reps and validating evidence.",
    "Connect the product to reduced status-collection effort and more productive coaching time.",
    "Use the CRM integration and Excel upload options to address deployment friction.",
    "Do not present example dashboard metrics as customer results or claim quantified forecast improvement."
  ],
  "ownershipAreas": [
    "Forecast governance and operating cadence",
    "CRM and revenue technology workflows",
    "Pipeline and deal inspection processes",
    "Executive revenue reporting",
    "Cross-functional alignment between sales leadership, finance, and operations"
  ],
  "likelyObjections": [
    "Forecasting may already be handled through existing CRM reports, dashboards, or call-review tools.",
    "Concern about rep adoption of another review workflow or AI interviewer.",
    "Questions about CRM integration depth, data handling, security, and implementation effort.",
    "Need to validate whether the platform complements existing sales methodology and forecast cadence.",
    "Budget scrutiny, particularly for larger teams requiring custom pricing.",
    "Need quantified evidence of forecast improvement or revenue impact, which is not provided."
  ],
  "researchGuidance": [
    "Confirm whether the contact owns forecasting governance versus only CRM administration or reporting.",
    "Determine the scope of responsibility across sales teams, managers, regions, and channel motions.",
    "Verify current CRM, forecast cadence, sales methodology, and deal-review process.",
    "Assess whether the contact can influence technology evaluation, budget, implementation, and adoption.",
    "Look for accountability tied to forecast confidence, pipeline risk, or executive reporting."
  ],
  "decisionInfluence": "High influence over process fit, workflow adoption, integrations, reporting requirements, and operational business case; authority varies by organization.",
  "departmentFunction": "Revenue operations",
  "negativeRoleSignals": [
    {
      "text": "Individual selling role only",
      "exclusionTestability": "TITLE_TESTABLE"
    },
    {
      "text": "Sales representative or account executive focused primarily on individual quota and opportunity execution.",
      "exclusionTestability": "TITLE_TESTABLE"
    },
    {
      "text": "Marketing operations leader focused primarily on campaign operations, lead routing, and marketing automation rather than sales forecasting.",
      "exclusionTestability": "TITLE_TESTABLE"
    },
    {
      "text": "CRM administrator whose scope is limited to technical configuration and ticket support without ownership of forecasting or revenue governance.",
      "exclusionTestability": "TITLE_TESTABLE"
    },
    {
      "text": "Front-line sales manager who only runs a single team's forecast calls without ownership of RevOps systems or cross-team governance.",
      "exclusionTestability": "TITLE_TESTABLE"
    },
    {
      "text": "Finance or FP&A professional who owns financial modeling and budgeting but not sales-process, CRM, or deal-inspection operations.",
      "exclusionTestability": "TITLE_TESTABLE"
    }
  ],
  "positiveRoleSignals": [
    "Owns or materially influences forecasting, pipeline inspection, or revenue governance.",
    "Responsible for CRM process design, revenue reporting, or sales-operations technology.",
    "Reports on forecast risk, commit health, or executive pipeline visibility.",
    "Is accountable for standardizing deal reviews across sales managers or teams.",
    "Needs stronger forecast governance without adding RevOps headcount.",
    "Evaluates Salesforce, HubSpot, Microsoft Dynamics, or Excel-based operational workflows."
  ],
  "provenanceAssessments": [
    {
      "note": "Product capabilities are customer evidence; role ownership alignment is model inference.",
      "claim": "The product is relevant to Revenue Operations Leaders because it addresses forecast governance, CRM workflows, executive reporting, and process consistency.",
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE",
        "MODEL_INFERENCE"
      ]
    },
    {
      "note": "No persona web excerpts or customer-specific persona materials were provided.",
      "claim": "The listed responsibilities and KPIs represent common Revenue Operations Leader scope.",
      "provenanceClasses": [
        "MODEL_INFERENCE"
      ]
    },
    {
      "note": "Use for research validation rather than as confirmed findings.",
      "claim": "The listed objections and organizational pressures are plausible for this buyer role but are not documented customer facts.",
      "provenanceClasses": [
        "MODEL_INFERENCE"
      ]
    }
  ],
  "proofPointsToEmphasize": [
    "Matthew interviews reps, validates deal evidence and buying signals, flags unsupported commits, and surfaces coaching opportunities.",
    "The platform provides executive dashboards, forecast analytics, gap attribution, and coaching intelligence.",
    "The product supports Salesforce, HubSpot, Microsoft Dynamics, and Excel upload.",
    "The Starter plan is listed at $500 per month for up to seven users.",
    "The platform is designed for B2B teams seeking stricter deal evidence without adding RevOps headcount."
  ],
  "kpisAndAccountabilities": [
    "Forecast visibility and confidence",
    "Forecast process consistency and adoption",
    "CRM data quality and completeness",
    "Identification of pipeline risk and qualification gaps",
    "Timeliness and usefulness of executive reporting",
    "Efficiency of forecast and deal-review processes"
  ],
  "organizationalPressures": [
    "Executives need more reliable visibility into commit risk.",
    "Revenue teams may use inconsistent sales methodologies and deal-review practices.",
    "Forecast calls can consume manager time that could otherwise be spent coaching.",
    "The organization may need stronger governance without adding RevOps headcount.",
    "CRM stages and seller-entered forecasts may not adequately demonstrate deal evidence."
  ],
  "primaryResponsibilities": [
    "Design and govern revenue forecasting processes.",
    "Standardize deal inspection and qualification practices across managers and teams.",
    "Maintain CRM workflows, data quality, integrations, and reporting.",
    "Provide executives with forecast visibility, risk attribution, and performance reporting.",
    "Enable sales managers with repeatable processes for deal reviews and coaching."
  ],
  "personaSpecificPositioning": [
    "Help RevOps establish a repeatable, evidence-backed forecast process without adding RevOps headcount.",
    "Give revenue leadership continuous visibility into unsupported commits, qualification gaps, and deal risk.",
    "Use Matthew to standardize deal reviews across teams, even when methodology adoption is inconsistent.",
    "Fit the platform into Salesforce, HubSpot, Microsoft Dynamics, or an Excel-based workflow."
  ],
  "desiredOutcomesFromSolution": [
    "Establish more consistent, evidence-backed forecast governance across revenue teams.",
    "Identify unsupported commits, deal risk, and qualification gaps earlier.",
    "Give executives clearer visibility into forecast confidence and risk attribution.",
    "Help managers spend forecast time coaching deals rather than gathering updates.",
    "Standardize AI-led deal reviews across teams using MEDDPICC, another methodology, or no formal methodology.",
    "Deploy through existing CRM workflows or Excel upload where CRM integration is not required."
  ]
} as PersonaAiDraft;
