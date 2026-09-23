/**
 * Production CRO persona draft from PersonaSetupRun cmt4i34120009to2opl62sec9 (Aug 2026).
 * AI emits free-form criterionType values including "disqualifier".
 */
import type { PersonaAiDraft } from "@/lib/persona-research/contract";

export const CRO_PERSONA_SETUP_RUN_V2_ID = "cmt4i34120009to2opl62sec9";

export const CRO_PERSONA_DRAFT_V2_FIXTURE = {
  "name": "Chief Revenue Officer",
  "criteria": [
    {
      "name": "Revenue forecast ownership",
      "operator": "equals_or_contains",
      "importance": "CRITICAL",
      "isRequired": true,
      "description": "Owns or is accountable for organizational revenue forecasting and committed revenue visibility.",
      "targetValue": "organizational revenue forecast ownership",
      "criterionType": "responsibility",
      "isDisqualifier": false,
      "researchGuidance": "Confirm scope of forecast ownership and whether the role communicates commitments to executive stakeholders."
    },
    {
      "name": "Sales organization accountability",
      "operator": "equals_or_contains",
      "importance": "HIGH",
      "isRequired": true,
      "description": "Has accountability for sales execution, revenue performance, or sales leadership effectiveness.",
      "targetValue": "sales and revenue performance accountability",
      "criterionType": "responsibility",
      "isDisqualifier": false,
      "researchGuidance": "Look for ownership of sales leadership, revenue targets, pipeline, or manager performance."
    },
    {
      "name": "Forecast-call participation",
      "operator": "equals_or_contains",
      "importance": "HIGH",
      "isRequired": true,
      "description": "Regularly leads, sponsors, or reviews forecast calls and deal commitments.",
      "targetValue": "regular forecast review participation",
      "criterionType": "behavior",
      "isDisqualifier": false,
      "researchGuidance": "Determine whether the role is involved in forecast governance directly or delegates it entirely."
    },
    {
      "name": "Need for evidence-backed deal visibility",
      "operator": "equals_or_contains",
      "importance": "HIGH",
      "isRequired": false,
      "description": "Experiences a need to distinguish CRM stages and seller optimism from validated deal evidence.",
      "targetValue": "need for evidence-backed forecast visibility",
      "criterionType": "pain_point",
      "isDisqualifier": false,
      "researchGuidance": "Look for stated concerns about forecast reliability, unsupported commits, or late-stage deal surprises."
    },
    {
      "name": "B2B sales organization context",
      "operator": "equals_or_contains",
      "importance": "HIGH",
      "isRequired": true,
      "description": "Works in a B2B sales organization that runs recurring forecast processes.",
      "targetValue": "B2B sales organization with forecast calls",
      "criterionType": "company_context",
      "isDisqualifier": false,
      "researchGuidance": "Confirm the organization has active sales forecasting and sufficient deal-based selling motion."
    },
    {
      "name": "No revenue or sales forecast responsibility",
      "operator": "equals",
      "importance": "CRITICAL",
      "isRequired": false,
      "description": "Role has no accountability for revenue forecasting, sales execution, or committed revenue outcomes.",
      "targetValue": true,
      "criterionType": "disqualifier",
      "isDisqualifier": true,
      "researchGuidance": "Exclude roles whose responsibilities are limited to functions unrelated to sales or revenue forecast governance."
    }
  ],
  "seniority": "Executive",
  "buyingRole": "Economic buyer and executive sponsor; likely to approve or strongly influence investment in revenue forecast governance.",
  "confidence": "HIGH",
  "painPoints": [
    "CRM forecast stages may not reflect actual deal evidence",
    "Unsupported commits and qualification gaps can remain hidden until late in the sales cycle",
    "Forecast calls may become status-collection exercises instead of coaching sessions",
    "Managers spend substantial time gathering incomplete deal information",
    "Different sales processes or methodology adoption levels can make deal reviews inconsistent"
  ],
  "roleSummary": "Executive leader accountable for revenue performance, sales execution, forecast confidence, and visibility into risks that could affect committed revenue.",
  "terminology": [
    "forecast governance",
    "unsupported commits",
    "deal evidence",
    "buyer-verified metrics",
    "commit health",
    "qualification gaps",
    "executive risk visibility",
    "AI-led deal review",
    "coaching opportunities",
    "forecast calls",
    "deal health scores",
    "confidence replaces optimism",
    "CRM stages do not equal deal truth"
  ],
  "evidenceRefs": [
    {
      "note": "Provided selectedBuyerRole context; role responsibility is also supported by disciplined domain inference.",
      "claim": "The selected buyer role is responsible for confidence in the revenue forecast and effectiveness of the sales organization.",
      "sourceIds": [],
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE",
        "MODEL_INFERENCE"
      ]
    },
    {
      "note": null,
      "claim": "ForecastWorks.io is positioned to provide executive risk visibility and evidence-backed commit governance.",
      "sourceIds": [
        "cmt3d2a6x000npr2op7op6q2m"
      ],
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE"
      ]
    },
    {
      "note": null,
      "claim": "Matthew interviews reps, validates deal evidence, flags unsupported commits, and surfaces coaching opportunities.",
      "sourceIds": [
        "cmt3d2a6x000npr2op7op6q2m"
      ],
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE"
      ]
    },
    {
      "note": null,
      "claim": "The platform is intended for B2B teams that already run forecast calls and need stricter deal evidence without adding RevOps headcount.",
      "sourceIds": [
        "cmt3d2a6x000npr2op7op6q2m"
      ],
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE"
      ]
    },
    {
      "note": "Disciplined inference from the Chief Revenue Officer role; not provided as direct customer or web evidence.",
      "claim": "The role likely owns revenue forecast governance, sales performance, pipeline quality, and executive communication of forecast risk.",
      "sourceIds": [],
      "provenanceClasses": [
        "MODEL_INFERENCE"
      ]
    },
    {
      "note": "Organizational buying-process inference; no direct evidence provided.",
      "claim": "Revenue Operations, Sales Operations, or Sales Enablement may participate as adjacent evaluators or stakeholders.",
      "sourceIds": [],
      "provenanceClasses": [
        "MODEL_INFERENCE"
      ]
    }
  ],
  "likelyTitles": [
    "Chief Revenue Officer",
    "Chief Sales Officer",
    "VP Revenue"
  ],
  "messagingNotes": [
    "Lead with evidence-backed forecast confidence and executive risk visibility.",
    "Position Matthew as challenging CRM-entered commitments and surfacing the evidence gaps leaders need to coach against.",
    "Emphasize reduced inspection burden and more productive forecast calls, without claiming guaranteed forecast accuracy or revenue lift.",
    "Use the organization’s existing CRM or Excel workflow as a deployment-fit discussion.",
    "Avoid presenting the product as a fully autonomous sales manager or as a replacement for executive judgment."
  ],
  "ownershipAreas": [
    "Revenue forecast governance",
    "Sales organization performance",
    "Pipeline and commit quality",
    "Executive risk visibility",
    "Forecast-call effectiveness",
    "Sales management and coaching consistency"
  ],
  "likelyObjections": [
    "Concern that an AI review agent may create rep resistance or add process overhead",
    "Questions about forecast accuracy, evidence quality, and how AI challenges seller commitments",
    "Need to understand integration depth with the existing CRM and forecast workflow",
    "Concern about implementation effort, data access, and executive reporting readiness",
    "Need proof that the platform improves coaching leverage rather than merely adding another dashboard",
    "Budget scrutiny, especially for larger teams using custom-priced plans"
  ],
  "researchGuidance": [
    "Confirm whether the individual owns the company-wide forecast, a business unit forecast, or only sales execution within a segment.",
    "Verify current forecast-call cadence, CRM environment, and whether forecast governance is centralized or manager-led.",
    "Assess whether forecast risk, unsupported commits, or qualification consistency is an active executive priority.",
    "Identify adjacent stakeholders in Revenue Operations, Sales Operations, Sales Enablement, Finance, and frontline sales management.",
    "Validate decision authority, pilot requirements, data-access expectations, and integration or security review needs."
  ],
  "decisionInfluence": "High. This role owns the business problem and executive accountability for forecast confidence, while Revenue Operations, Sales Operations, or Sales Enablement may assess workflow and implementation fit.",
  "departmentFunction": "Revenue leadership",
  "negativeRoleSignals": [
    "Has no responsibility for revenue forecasting or sales execution",
    "Owns only marketing, finance, or customer success outcomes without sales-forecast accountability",
    "Is focused exclusively on individual-deal administration without executive forecast ownership",
    "Rejects changes to forecast governance or does not participate in forecast reviews"
  ],
  "positiveRoleSignals": [
    "Owns company-level or segment-level revenue forecasting",
    "Regularly leads or reviews forecast calls",
    "Accountable for committed revenue and executive forecast communication",
    "Expresses concern about forecast accuracy, unsupported commits, or late-stage deal risk",
    "Wants managers spending more time coaching and less time collecting status",
    "Has authority to sponsor changes to sales-management processes or tooling"
  ],
  "provenanceAssessments": [
    {
      "note": "The selectedBuyerRole explicitly states this context; broader responsibility details are inferred from the role.",
      "claim": "The selected buyer role is a senior revenue executive accountable for forecast confidence and sales effectiveness.",
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE",
        "MODEL_INFERENCE"
      ]
    },
    {
      "note": "Directly supported by the approved product description and product evidence.",
      "claim": "The product addresses unsupported commits, qualification gaps, executive risk visibility, and coaching opportunities.",
      "provenanceClasses": [
        "CUSTOMER_EVIDENCE"
      ]
    },
    {
      "note": "These are typical executive evaluation concerns, not documented customer facts.",
      "claim": "The role may face budget, integration, implementation, and AI-adoption objections.",
      "provenanceClasses": [
        "MODEL_INFERENCE"
      ]
    }
  ],
  "proofPointsToEmphasize": [
    "Matthew interviews reps, validates deal evidence and buying signals, flags unsupported commits, and surfaces coaching opportunities.",
    "The platform provides executive dashboards, forecast analytics, deal health, risk visibility, and gap attribution.",
    "The product supports Salesforce, HubSpot, Microsoft Dynamics, standalone use, and Excel uploads.",
    "A 30-day pilot is offered, and Starter pricing is listed at $500 per month for up to seven users.",
    "The product is positioned for B2B teams already running forecast calls that need stricter deal evidence without adding RevOps headcount."
  ],
  "kpisAndAccountabilities": [
    "Forecast confidence and reliability",
    "Committed revenue performance",
    "Pipeline coverage and quality",
    "Identification of deal risk and qualification gaps",
    "Sales-manager effectiveness and coaching leverage",
    "Time spent by leaders on forecast inspection versus coaching"
  ],
  "organizationalPressures": [
    "Need to distinguish genuine commits from seller optimism",
    "Pressure to provide executives with defensible revenue visibility",
    "Limited leadership time for inspecting active deals",
    "Inconsistent deal-review quality across managers or teams",
    "Need to improve forecast governance without adding RevOps headcount"
  ],
  "primaryResponsibilities": [
    "Set revenue strategy and operating priorities",
    "Own sales performance and revenue execution",
    "Review and govern pipeline and forecast commitments",
    "Ensure sales managers have visibility into deal risk and coaching priorities",
    "Align sales leadership, revenue operations, and executive stakeholders around forecast expectations"
  ],
  "personaSpecificPositioning": [
    "Give revenue leaders a continuously updated view of which commits are supported, where qualification gaps exist, and where coaching is needed.",
    "Help replace optimistic CRM forecasts with evidence-backed deal visibility before executive commitments are at risk.",
    "Turn forecast governance into a management and coaching system rather than a recurring status-collection exercise.",
    "Provide a methodology-flexible way to standardize deal reviews across teams with uneven process consistency."
  ],
  "desiredOutcomesFromSolution": [
    "Gain executive risk visibility into unsupported commits, deal health, and qualification gaps",
    "Base forecast discussions on validated deal evidence and buyer-verified metrics rather than seller intuition",
    "Identify forecast risk and coaching priorities earlier, before commits miss",
    "Spend more forecast-call time coaching deals instead of collecting rep updates",
    "Create more consistent AI-led deal reviews across teams, whether or not they use a formal sales methodology",
    "Use standalone, CRM-connected, or Excel-upload workflows that fit the organization’s operating environment"
  ]
} as PersonaAiDraft;
