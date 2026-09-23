import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCandidateProfile,
  type CandidateProfile,
} from "@/lib/product-research/candidate-profile";

const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));

export function fixtureResumeAlexChenText(): string {
  return readFileSync(join(FIXTURE_DIR, "resume-alex-chen.txt"), "utf8");
}

/** Valid candidate profile synthesized from the Alex Chen fixture resume. */
export function fixtureAlexChenProfile(
  sourceId = "src_resume_alex_chen",
): CandidateProfile {
  return parseCandidateProfile({
    schemaVersion: 1,
    identity: {
      name: {
        id: "id_name",
        kind: "FACT",
        text: "Alex Chen",
        provenance: [{ sourceId }],
      },
      headline: {
        id: "id_headline",
        kind: "FACT",
        text: "Senior Software Engineer",
        provenance: [{ sourceId }],
      },
      location: {
        id: "id_location",
        kind: "FACT",
        text: "Seattle, WA",
        provenance: [{ sourceId }],
      },
      workArrangementPreference: {
        id: "id_work_arrangement",
        kind: "FACT",
        text: "Open to hybrid",
        provenance: [{ sourceId }],
      },
      relocationOpenness: {
        id: "id_relocation",
        kind: "FACT",
        text: "Willing to relocate within the US",
        provenance: [{ sourceId }],
      },
    },
    positioning: {
      id: "id_positioning",
      kind: "INFERENCE",
      text: "Backend engineer who has shipped billing and identity systems at two B2B SaaS companies.",
      provenance: [{ sourceId }],
    },
    direction: {
      targetTitles: [
        {
          id: "id_title_1",
          kind: "INFERENCE",
          text: "Senior Software Engineer",
          provenance: [{ sourceId }],
        },
      ],
      seniority: {
        id: "id_seniority",
        kind: "FACT",
        text: "Senior individual contributor; not a people manager",
        provenance: [{ sourceId }],
      },
      functions: [
        {
          id: "id_fn_1",
          kind: "FACT",
          text: "Backend engineering",
          provenance: [{ sourceId }],
        },
      ],
      careerGoals: [],
    },
    experience: [
      {
        id: "role_1",
        kind: "FACT",
        employer: "Northwind Analytics",
        title: "Senior Software Engineer",
        startDate: "2021-01",
        endDate: null,
        location: "Seattle, WA",
        summary: "Billing and payments systems.",
        achievements: [
          {
            id: "ach_1",
            kind: "FACT",
            text: "Led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
            provenance: [{ sourceId }],
          },
          {
            id: "ach_2",
            kind: "FACT",
            text: "Owned on-call for the payments service (one week in four).",
            provenance: [{ sourceId }],
          },
        ],
        provenance: [{ sourceId }],
      },
      {
        id: "role_2",
        kind: "FACT",
        employer: "Contoso Health",
        title: "Software Engineer",
        startDate: "2017-06",
        endDate: "2020-12",
        location: "Remote",
        summary: "Member-identity API for the patient portal.",
        achievements: [
          {
            id: "ach_3",
            kind: "FACT",
            text: "Built the member-identity API used by the patient portal.",
            provenance: [{ sourceId }],
          },
        ],
        provenance: [{ sourceId }],
      },
    ],
    skills: [
      {
        id: "skill_1",
        kind: "FACT",
        text: "TypeScript",
        provenance: [{ sourceId }],
      },
      {
        id: "skill_2",
        kind: "FACT",
        text: "PostgreSQL",
        provenance: [{ sourceId }],
      },
      {
        id: "skill_3",
        kind: "FACT",
        text: "distributed systems",
        provenance: [{ sourceId }],
      },
      {
        id: "skill_4",
        kind: "FACT",
        text: "incident response",
        provenance: [{ sourceId }],
      },
    ],
    problemsSolved: [
      {
        id: "prob_1",
        kind: "FACT",
        text: "Failed billing runs during invoice generation",
        provenance: [{ sourceId }],
      },
    ],
    differentiators: [
      {
        id: "diff_1",
        kind: "INFERENCE",
        text: "Production ownership of billing and identity systems without people-management scope.",
        provenance: [{ sourceId }],
      },
    ],
    education: [
      {
        id: "edu_1",
        kind: "FACT",
        text: "B.S. Computer Science, University of Washington, 2017",
        provenance: [{ sourceId }],
      },
    ],
    credentials: [],
    domainVocabulary: [
      {
        id: "term_1",
        kind: "FACT",
        text: "invoice generation",
        provenance: [{ sourceId }],
      },
    ],
    compensation: {
      id: "comp_1",
      kind: "FACT",
      text: "Seeking $180,000–$200,000 base in Seattle.",
      provenance: [{ sourceId }],
    },
    gaps: [
      {
        id: "gap_1",
        area: "experience",
        detail: "Earlier internships are mentioned without dates or employers.",
      },
    ],
  });
}
