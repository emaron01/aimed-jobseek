/**
 * STEP 0 only: run assessHiringTeamDraft against built campaign personas
 * in local DBs and known fixtures. Does not modify data.
 *
 * Usage: npx tsx scripts/step0-assess-hiring-team-drafts.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  assessHiringTeamDraft,
  jobRequirementLines,
  type HiringTeamDraftFields,
  type HiringTeamNarrative,
} from "../src/lib/hiring-team/draft-quality";
import type { HiringTeamJobEvidence } from "../src/lib/hiring-team/evidence";
import { normalizeParsedJobRequirement } from "../src/lib/job-requirement/normalize";
import { NORMAL_JOB_MODEL, NORMAL_JOB_POSTING } from "../src/lib/job-requirement/fixtures";

function parseEnvFile(filename: string): Record<string, string> {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0"
    );
  } catch {
    return false;
  }
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "text" in value) {
    const t = (value as { text?: unknown }).text;
    return typeof t === "string" ? t.trim() : "";
  }
  return "";
}

function listOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(textOf).filter(Boolean);
}

function fieldsFromStoredNarrative(narrative: unknown): HiringTeamDraftFields | null {
  if (!narrative || typeof narrative !== "object") return null;
  const n = narrative as Record<string, unknown>;
  // Minimal incomplete fixtures may only have overview string
  const overview = textOf(n.overview);
  if (!overview && !textOf(n.impact) && listOf(n.needs).length === 0) return null;
  return {
    overview,
    pressures: listOf(n.pressures),
    impact: textOf(n.impact),
    needs: listOf(n.needs),
    concerns: listOf(n.concerns),
    interviewStage: textOf(n.interviewStage) || null,
    evaluates: listOf(n.evaluates),
    talkingPoints: listOf(n.talkingPoints),
    communication: listOf(n.communication),
  };
}

function involvementOf(profileJson: unknown): "DIRECT" | "INDIRECT" {
  if (!profileJson || typeof profileJson !== "object") return "DIRECT";
  return (profileJson as { involvement?: unknown }).involvement === "INDIRECT"
    ? "INDIRECT"
    : "DIRECT";
}

function jobLinesFromRequirement(job: {
  title: string | null;
  companyName: string | null;
  reportingLine: string | null;
  responsibilities: unknown;
  requiredItems: unknown;
  preferredItems: unknown;
  scorecardJson: unknown;
}): string[] {
  const asStrings = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          return typeof (item as { text: unknown }).text === "string"
            ? (item as { text: string }).text
            : "";
        }
        return "";
      })
      .map((s) => s.trim())
      .filter(Boolean);
  };
  const scorecard =
    job.scorecardJson && typeof job.scorecardJson === "object"
      ? (job.scorecardJson as {
          mission?: { text?: string };
          outcomes?: Array<{ text?: string }>;
          competencies?: Array<{ text?: string }>;
        })
      : {};
  const evidence: HiringTeamJobEvidence = {
    title: job.title,
    companyName: job.companyName,
    location: null,
    workArrangement: null,
    employmentType: null,
    seniority: null,
    compensationRange: null,
    reportingLine: job.reportingLine,
    responsibilities: asStrings(job.responsibilities),
    requiredItems: asStrings(job.requiredItems),
    preferredItems: asStrings(job.preferredItems),
    scorecard: {
      mission: scorecard.mission?.text
        ? { text: scorecard.mission.text, kind: "FACT" as const }
        : null,
      outcomes: (scorecard.outcomes ?? []).map((o) => ({
        text: o.text ?? "",
        kind: "FACT" as const,
      })),
      competencies: (scorecard.competencies ?? []).map((c) => ({
        text: c.text ?? "",
        kind: "FACT" as const,
      })),
    },
  };
  return jobRequirementLines(evidence);
}

/** Plan classification: first assess failure = fixable; we report each reason as fixable (STEP 0). */
function classifyReason(_reason: string): "fixable" {
  return "fixable";
}

type CheckRow = {
  source: string;
  id: string;
  name: string;
  ok: boolean;
  reasons: string[];
  incompleteShape: boolean;
};

function checkFields(
  source: string,
  id: string,
  name: string,
  fields: HiringTeamDraftFields,
  jobLines: string[],
  involvement: "DIRECT" | "INDIRECT",
  likelyTitles: string[],
): CheckRow {
  const result = assessHiringTeamDraft({
    fields,
    jobLines,
    involvement,
    roleName: name,
    likelyTitles,
  });
  const incompleteShape =
    !fields.overview.trim() ||
    !fields.impact.trim() ||
    fields.needs.length < 2 ||
    fields.pressures.length < 1 ||
    fields.talkingPoints.length < 1;
  return {
    source,
    id,
    name,
    ok: result.ok,
    reasons: result.ok ? [] : result.reasons,
    incompleteShape,
  };
}

function fixtureChecks(): CheckRow[] {
  const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
  const jobLines = jobRequirementLines({
    title: parsed.title,
    companyName: parsed.companyName,
    location: parsed.location,
    workArrangement: parsed.workArrangement,
    employmentType: parsed.employmentType,
    seniority: parsed.seniority,
    compensationRange: parsed.compensationRange,
    reportingLine: parsed.reportingLine,
    responsibilities: parsed.responsibilities,
    requiredItems: parsed.requiredItems,
    preferredItems: parsed.preferredItems,
    scorecard: parsed.scorecard,
  });

  const substantive: HiringTeamDraftFields = {
    overview:
      "The Director of Engineering owns delivery of the warehouse robot fleet, on-call load, team capacity, and the hiring bar for engineers who ship motion software.",
    pressures: [
      "They are measured on fleet uptime and how quickly the motion service recovers after an incident, so an open senior seat leaves that load on them.",
    ],
    impact:
      "This hire takes the motion-service on-call rotation off the director and lets them keep the fleet reliability plan on schedule.",
    needs: [
      "In the first months, own production incidents on the motion service through resolution.",
      "Set a hiring bar the director can defend when the next engineer is interviewed.",
    ],
    concerns: [
      "They will doubt a candidate who has not owned a production robotics service through an incident.",
    ],
    interviewStage: "hiring manager chronological walk-through",
    evaluates: ["Whether the candidate has owned production outcomes, not only designed them."],
    talkingPoints: [
      "Describe how you would sit with the reliability rotation in the first month and take the overnight pages.",
    ],
    communication: [
      "They want the work in the order it happened, with the outcome you owned.",
    ],
  };

  const deficientOnlyOverview: HiringTeamDraftFields = {
    overview: "Built customer-success persona.",
    pressures: [],
    impact: "",
    needs: [],
    concerns: [],
    interviewStage: null,
    evaluates: [],
    talkingPoints: [],
    communication: [],
  };

  return [
    checkFields(
      "fixture:substantiveDirectorDraft",
      "fixture-substantive",
      "Director of Engineering",
      substantive,
      jobLines,
      "DIRECT",
      ["Director of Engineering"],
    ),
    checkFields(
      "fixture:hiring-team.test incomplete overview-only",
      "fixture-incomplete",
      "Customer Success",
      deficientOnlyOverview,
      jobLines,
      "DIRECT",
      [],
    ),
  ];
}

async function dbChecks(label: string, databaseUrl: string): Promise<CheckRow[]> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const rows: CheckRow[] = [];
  try {
    const personas = await prisma.persona.findMany({
      where: {
        archivedAt: null,
        campaignId: { not: null },
      },
      select: {
        id: true,
        name: true,
        targetTitles: true,
        profileJson: true,
        campaignId: true,
        organizationId: true,
      },
    });
    for (const persona of personas) {
      const profile = persona.profileJson;
      if (!profile || typeof profile !== "object") continue;
      const narrative = (profile as { narrative?: unknown }).narrative;
      if (!narrative || typeof narrative !== "object") continue;
      const fields = fieldsFromStoredNarrative(narrative);
      if (!fields) continue;

      let jobLines: string[] = [];
      if (persona.campaignId) {
        const job = await prisma.jobRequirement.findFirst({
          where: {
            campaignId: persona.campaignId,
            organizationId: persona.organizationId,
          },
          select: {
            title: true,
            companyName: true,
            reportingLine: true,
            responsibilities: true,
            requiredItems: true,
            preferredItems: true,
            scorecardJson: true,
          },
        });
        if (job) jobLines = jobLinesFromRequirement(job);
      }

      const titles = Array.isArray(persona.targetTitles)
        ? persona.targetTitles.filter((t): t is string => typeof t === "string")
        : [];

      rows.push(
        checkFields(
          label,
          persona.id,
          persona.name,
          fields,
          jobLines,
          involvementOf(profile),
          titles,
        ),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
  return rows;
}

async function main() {
  const all: CheckRow[] = [...fixtureChecks()];

  const testEnv = { ...parseEnvFile(".env.test.example"), ...parseEnvFile(".env.test") };
  const testUrl =
    process.env.TEST_DATABASE_URL?.trim() ||
    testEnv.TEST_DATABASE_URL?.trim() ||
    testEnv.DATABASE_URL?.trim() ||
    "";
  if (testUrl && isLoopback(testUrl)) {
    try {
      all.push(...(await dbChecks("db:.env.test", testUrl)));
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "step0_test_db_failed",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  } else {
    console.error(
      JSON.stringify({
        event: "step0_test_db_skipped",
        reason: testUrl ? "non-loopback" : "missing",
      }),
    );
  }

  const local = parseEnvFile(".env.local").DATABASE_URL?.trim() || "";
  if (local && isLoopback(local) && local !== testUrl) {
    try {
      all.push(...(await dbChecks("db:.env.local", local)));
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "step0_local_db_failed",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  } else if (local && !isLoopback(local)) {
    console.error(
      JSON.stringify({
        event: "step0_local_db_skipped",
        reason: "refusing non-loopback .env.local (may be production)",
      }),
    );
  }

  const rejected = all.filter((row) => !row.ok);
  const completeRejected = rejected.filter((row) => !row.incompleteShape);
  const deficientRejected = rejected.filter((row) => row.incompleteShape);

  const report = {
    checked: all.length,
    rejected: rejected.length,
    rejectedCompleteLooking: completeRejected.length,
    rejectedGenuinelyDeficientShape: deficientRejected.length,
    accepted: all.filter((row) => row.ok).length,
    rejections: rejected.map((row) => ({
      source: row.source,
      id: row.id,
      name: row.name,
      incompleteShape: row.incompleteShape,
      reasons: row.reasons.map((reason) => ({
        reason,
        classification: classifyReason(reason),
      })),
    })),
    stop:
      completeRejected.length > 0
        ? "STOP: assessHiringTeamDraft rejected persona(s) with non-empty multi-field narratives — do not wire in"
        : "CONTINUE: only deficient or no rejections among complete narratives",
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
