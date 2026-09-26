/**
 * Guard: exported server actions must not return Promise<void>.
 * Prevents silent form clears when errors are swallowed.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const actionsRoot = path.resolve(process.cwd(), "src/app");
const VOID_ACTION_ALLOWLIST = new Set(["logoutAction"]);

function listActionFiles(): string[] {
  const out: string[] = [];
  const actionsDir = path.join(actionsRoot, "actions");
  if (readdirSync(actionsDir).length) {
    for (const entry of readdirSync(actionsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".ts")) {
        out.push(path.join(actionsDir, entry.name));
      }
    }
  }
  const rootActions = path.join(actionsRoot, "actions.ts");
  try {
    readFileSync(rootActions, "utf8");
    out.push(rootActions);
  } catch {
    // no root actions.ts
  }
  return out;
}

function exportedActionNames(source: string): string[] {
  const names: string[] = [];
  const re = /export async function (\w+Action)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    names.push(match[1]);
  }
  return names;
}

function returnTypeForAction(source: string, actionName: string): string | null {
  const re = new RegExp(
    `export async function ${actionName}\\([\\s\\S]*?\\):\\s*Promise<([^>]+)>`,
  );
  const match = source.match(re);
  return match?.[1]?.trim() ?? null;
}

describe("server action return types", () => {
  it("exported *Action functions do not return Promise<void> (except allowlist)", () => {
    const violations: string[] = [];

    for (const file of listActionFiles()) {
      const source = readFileSync(file, "utf8");
      const rel = path.relative(process.cwd(), file);
      for (const name of exportedActionNames(source)) {
        if (VOID_ACTION_ALLOWLIST.has(name)) continue;
        const ret = returnTypeForAction(source, name);
        if (ret === "void") {
          violations.push(`${rel} → ${name}(): Promise<void>`);
        }
      }
    }

    expect(
      violations,
      `Void server actions drifted again:\n${violations.join("\n")}\nReturn a typed result ({ ok, message, ... }) instead.`,
    ).toEqual([]);
  });
});

describe("action result UI seams", () => {
  const seams: Array<{ form: string; statusTestId: string }> = [
    { form: "src/components/CandidateProfileEditForm.tsx", statusTestId: "candidate-profile-edit-status" },
    { form: "src/components/NewCampaignForm.tsx", statusTestId: "campaign-action-status" },
    { form: "src/components/ScoreReportClient.tsx", statusTestId: "campaign-action-status" },
    { form: "src/components/ScoreListForm.tsx", statusTestId: "scoring-run-status" },
    { form: "src/components/IcpDetailsForm.tsx", statusTestId: "icp-action-status" },
    { form: "src/components/ChangePasswordForm.tsx", statusTestId: "change-password-status" },
    { form: "src/components/ManualCompanyResearchForm.tsx", statusTestId: "manual-research-status" },
    { form: "src/components/ActionFeedbackForm.tsx", statusTestId: "action-feedback-status" },
    { form: "src/components/VoiceSamplesForm.tsx", statusTestId: "voice-action-status" },
    { form: "src/components/EmailSignatureForm.tsx", statusTestId: "signature-action-status" },
    { form: "src/components/CampaignContactsManager.tsx", statusTestId: "campaign-contacts-status" },
    { form: "src/components/CampaignEmailSettingsForm.tsx", statusTestId: "campaign-email-settings-status" },
  ];

  it.each(seams)(
    "$form renders $statusTestId from useActionState",
    ({ form, statusTestId }) => {
      const source = readFileSync(form, "utf8");
      expect(source).toContain("useActionState");
      expect(source).toContain(statusTestId);
      expect(source).toMatch(/(?:state|\w+State|result)\.message/);
    },
  );
});

describe("redirect-throwing actions keep redirect outside try/catch", () => {
  it("createScoringRunAction calls redirect after try/catch, not inside", () => {
    const source = readFileSync("src/app/actions/scoring.ts", "utf8");
    const fnMatch = source.match(
      /export async function createScoringRunAction[\s\S]*?(?=export async function|$)/,
    );
    expect(fnMatch).toBeTruthy();
    const body = fnMatch![0];
    expect(body).toMatch(/try\s*\{[\s\S]*createScoringRun/);
    expect(body).toMatch(/\}\s*catch[\s\S]*return\s*\{\s*ok:\s*false/);
    const afterCatch = body.split(/\}\s*catch[\s\S]*?\n\s*\}/).pop() ?? "";
    expect(afterCatch).toContain("redirect(");
    expect(afterCatch).not.toMatch(/try\s*\{[\s\S]*redirect\(/);
  });

  it.each([
    "deleteCampaignAction",
    "deleteProductAction",
    "deleteContactListAction",
  ])("%s calls redirect after try/catch, not inside", (name) => {
    const source = readFileSync("src/app/actions.ts", "utf8");
    const start = source.indexOf(`export async function ${name}`);
    expect(start).toBeGreaterThan(-1);
    const next = source.indexOf("export async function", start + 1);
    const body = source.slice(start, next === -1 ? undefined : next);
    expect(body).toMatch(/\}\s*catch[\s\S]*return\s*\{\s*ok:\s*false/);
    const afterCatch = body.split(/\}\s*catch[\s\S]*?\n\s*\}/).pop() ?? "";
    expect(afterCatch).toContain("redirect(");
    expect(afterCatch).not.toMatch(/try\s*\{[\s\S]*redirect\(/);
  });
});
