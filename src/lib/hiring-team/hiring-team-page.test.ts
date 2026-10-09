import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applicationStepByKey,
  applicationWorkspaceCopy,
  hiringTeamConfig,
  hiringTeamDetailsTitle,
} from "@/lib/product-config";
import {
  hiringTeamInvolvement,
  profileJsonWithInvolvement,
} from "@/lib/hiring-team/build";

function sourceFiles() {
  return {
    workspace: readFileSync("src/components/ApplicationWorkspace.tsx", "utf8"),
    picker: readFileSync("src/components/HiringTeamPersonPicker.tsx", "utf8"),
    actions: readFileSync("src/components/HiringTeamRoleActions.tsx", "utf8"),
    tracker: readFileSync("src/components/ApplicationSidebarTracker.tsx", "utf8"),
    steps: readFileSync("src/lib/product-config/application-steps.ts", "utf8"),
    serverActions: readFileSync("src/app/actions/hiring-team.ts", "utf8"),
  };
}

describe("hiring team page copy and layout", () => {
  it("uses the new name in the page header, side navigation, and overview", () => {
    const title = "Interviewer Profiles";
    expect(applicationWorkspaceCopy.hiringTeamTitle).toBe(title);
    expect(hiringTeamConfig.workspaceTitle).toBe(title);
    expect(applicationStepByKey("hiring-team").title).toBe(title);
    const { workspace, tracker, steps } = sourceFiles();
    expect(workspace).toContain("hiringTeamConfig.workspaceTitle");
    expect(steps).toContain("hiringTeamConfig.workspaceTitle");
    expect(tracker).toContain("{step.number}. {step.title}");
  });

  it("shows the Hiring Team roles notice in the warning box", () => {
    expect(hiringTeamConfig.assumptionIntro).toBe(
      "Harper identified these Hiring Team roles from the job posting and company research. Select the roles that align to the title or responsibilities of the person who you are interviewing with. NOTE: You can select personas as they are identified.",
    );
    const { workspace } = sourceFiles();
    expect(workspace).toContain("HiringTeamAssumptionNotice");
    expect(workspace).not.toContain("guessed these");
    expect(workspace).not.toContain("They are assumptions");
  });

  it("lets the seeker move a persona between Direct and Indirect", () => {
    const { workspace, serverActions } = sourceFiles();
    expect(workspace).toContain("moveApplicationRoleInvolvementAction");
    expect(workspace).toContain("move-role-involvement-");
    expect(workspace).toContain("hiringTeamConfig.actions.moveToDirect");
    expect(workspace).toContain("hiringTeamConfig.actions.moveToIndirect");
    expect(serverActions).toContain("moveApplicationHiringTeamRoleInvolvement");
    const moved = profileJsonWithInvolvement(
      {
        involvement: "DIRECT",
        identification: { involvement: "DIRECT", name: "Hiring manager" },
      },
      "INDIRECT",
    ) as { involvement: string; identification: { involvement: string } };
    expect(moved.involvement).toBe("INDIRECT");
    expect(moved.identification.involvement).toBe("INDIRECT");
    expect(hiringTeamInvolvement(moved)).toBe("INDIRECT");
    expect(
      hiringTeamInvolvement(profileJsonWithInvolvement({}, "DIRECT")),
    ).toBe("DIRECT");
  });

  it("puts Edit and I know who is interviewing at the top right of each card", () => {
    const { workspace, actions, picker } = sourceFiles();
    expect(actions).toContain("hiringTeamConfig.actions.edit");
    expect(actions).toContain("hiringTeamConfig.actions.knowWhoInterviewing");
    expect(actions).toContain("persona-card-actions-");
    expect(actions).toContain("know-who-interviewing-");
    expect(actions).toContain("justify-end");
    expect(actions).toContain("hiringTeamConfig.addPersonTitle");
    expect(workspace).toContain("items-start justify-between");
    expect(workspace).toContain("HiringTeamPersonPicker");
    expect(picker).toContain("assignExistingHiringTeamPersonAction");
    expect(picker).toContain("addHiringTeamPersonAction");
    expect(picker).toContain("interviewConfig.labels.chooseInterviewer");
    expect(picker).toContain("interviewConfig.labels.addNewInterviewer");
    expect(picker).toContain('name="firstName" required');
    expect(picker).toContain('name="lastName" required');
    expect(picker).toContain('name="title" required');
    expect(picker).toContain('name="email" type="email"');
    expect(picker).not.toContain('name="email" required');
    expect(picker).toContain('name="linkedinUrl"');
    expect(picker).not.toContain('name="linkedinUrl" required');
    expect(picker).toContain('name="linkedInProfileText"');
    expect(picker).toContain("pasteInterviewerProfile");
    const cardBlock = workspace.slice(
      workspace.indexOf("hiring-team-role"),
      workspace.indexOf('id="hiring-team"'),
    );
    expect(cardBlock).not.toContain(
      "<summary className=\"cursor-pointer text-sm font-semibold text-ink\">\n                {hiringTeamConfig.actions.addPerson}",
    );
    expect(cardBlock).toContain("addPersonForm");
  });

  it("labels the details section with the persona name", () => {
    expect(hiringTeamDetailsTitle("Hiring manager")).toBe(
      "Hiring manager Details",
    );
    const { workspace } = sourceFiles();
    expect(workspace).toContain("hiringTeamDetailsTitle(role.name)");
  });
});
