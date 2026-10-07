import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { approvedRequirementTargetKey } from "@/lib/consultation/harper-layout";

/**
 * The catch-up uses the same key approveConsultationStatement passes:
 * the question card's target key, or the statement turn's key.
 */
function catchUpSetsStrong(input: {
  strength: "STRONG" | "PARTIAL" | "NONE";
  assessmentTargetKey: string;
  statementKind: string;
  statementStatus: string;
  cardTargetKey: string | null;
  turnTargetKey: string | null;
  gapDecision: "evidence" | "no_evidence" | "incomplete" | null;
}): boolean {
  if (input.statementStatus !== "APPROVED") return false;
  if (input.strength !== "PARTIAL" && input.strength !== "NONE") return false;
  const key = approvedRequirementTargetKey({
    statementKind: input.statementKind,
    targetKey: input.cardTargetKey ?? input.turnTargetKey,
    confirmedGap: input.gapDecision === "no_evidence",
  });
  return key !== "" && key === input.assessmentTargetKey.trim();
}

describe("approved requirement rows catch-up", () => {
  it("turns a PARTIAL or NONE requirement row STRONG when its interview answer is approved", () => {
    const approved = {
      statementKind: "INTERVIEW_ANSWER",
      statementStatus: "APPROVED",
      cardTargetKey: "required:methods",
      turnTargetKey: "question:q1",
      gapDecision: "evidence" as const,
    };
    expect(
      catchUpSetsStrong({
        ...approved,
        strength: "PARTIAL",
        assessmentTargetKey: "required:methods",
      }),
    ).toBe(true);
    expect(
      catchUpSetsStrong({
        ...approved,
        strength: "NONE",
        assessmentTargetKey: "required:methods",
      }),
    ).toBe(true);
    expect(
      catchUpSetsStrong({
        strength: "PARTIAL",
        assessmentTargetKey: "outcome:1",
        statementKind: "INTERVIEW_ANSWER",
        statementStatus: "APPROVED",
        cardTargetKey: null,
        turnTargetKey: "outcome:1",
        gapDecision: null,
      }),
    ).toBe(true);
  });

  it("leaves an acknowledge-the-gap approval, a resume bullet, and a non-requirement card unchanged", () => {
    expect(
      catchUpSetsStrong({
        strength: "PARTIAL",
        assessmentTargetKey: "required:nursing",
        statementKind: "INTERVIEW_ANSWER",
        statementStatus: "APPROVED",
        cardTargetKey: "required:nursing",
        turnTargetKey: "required:nursing",
        gapDecision: "no_evidence",
      }),
    ).toBe(false);
    expect(
      catchUpSetsStrong({
        strength: "NONE",
        assessmentTargetKey: "required:nursing",
        statementKind: "RESUME_BULLET",
        statementStatus: "APPROVED",
        cardTargetKey: "required:nursing",
        turnTargetKey: "required:nursing",
        gapDecision: "evidence",
      }),
    ).toBe(false);
    expect(
      catchUpSetsStrong({
        strength: "PARTIAL",
        assessmentTargetKey: "why-this-company",
        statementKind: "INTERVIEW_ANSWER",
        statementStatus: "APPROVED",
        cardTargetKey: "why-this-company",
        turnTargetKey: "why-this-company",
        gapDecision: "evidence",
      }),
    ).toBe(false);
  });

  it("leaves a STRONG row unchanged", () => {
    expect(
      catchUpSetsStrong({
        strength: "STRONG",
        assessmentTargetKey: "required:software",
        statementKind: "INTERVIEW_ANSWER",
        statementStatus: "APPROVED",
        cardTargetKey: "required:software",
        turnTargetKey: "question:q2",
        gapDecision: "evidence",
      }),
    ).toBe(false);
  });

  it("migration updates only strength and encodes that same rule", () => {
    const sql = readFileSync(
      "prisma/migrations/20261007011000_approved_requirement_rows_strong/migration.sql",
      "utf8",
    );
    expect(sql).toContain(
      `SET strength = 'STRONG'::"EvidenceStrength"`,
    );
    expect(sql.match(/^SET .+$/gm)).toEqual([
      `SET strength = 'STRONG'::"EvidenceStrength"`,
    ]);
    expect(sql).toContain(`'PARTIAL'::"EvidenceStrength"`);
    expect(sql).toContain(`'NONE'::"EvidenceStrength"`);
    expect(sql).toContain(`'INTERVIEW_ANSWER'::"ConsultationStatementKind"`);
    expect(sql).toContain(`'APPROVED'::"ConsultationStatementStatus"`);
    expect(sql).toContain(`<> 'no_evidence'`);
    expect(sql).toContain(
      `^(required|outcome|competency|preferred|mission):`,
    );
    expect(sql).toContain(`replyToTurnId`);
    expect(sql).toContain(`'question:' || linked.id`);
    expect(sql).toContain(`NULLIF(btrim(turn."targetKey"), '')`);
    expect(sql.indexOf(`NULLIF(btrim(card."targetKey"), '')`)).toBeLessThan(
      sql.indexOf(`NULLIF(btrim(turn."targetKey"), '')`),
    );
    const approve = readFileSync("src/lib/consultation/service.ts", "utf8");
    const start = approve.indexOf(
      "export async function approveConsultationStatement",
    );
    const body = approve.slice(start, approve.indexOf("export async function", start + 10));
    expect(body).toContain("approvedRequirementTargetKey");
    expect(body).toContain("card?.targetKey ?? statement.turn.targetKey");
    expect(body).toContain(
      'gapDecisionFromAnalysis(statement.turn.analysisJson) === "no_evidence"',
    );
    expect(body).toContain('strength: "STRONG"');
  });
});
