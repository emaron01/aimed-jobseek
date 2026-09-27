import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONSULTATION_PROMPT_VERSION,
} from "@/lib/consultation/contract";
import {
  buildConsultationCoachMessages,
  buildConsultationExtractMessages,
  buildConsultationPolishMessages,
} from "@/lib/consultation/prompt";
import { outreachConfig } from "@/lib/product-config";

const profileItems = [
  {
    id: "fact_1",
    kind: "FACT",
    text: "Rebuilt the forecast at Helios.",
    itemType: "ACHIEVEMENT",
  },
];

describe("Harper context finish", () => {
  it("sends the full Personal Profile to Extract and Polish", () => {
    const extract = JSON.parse(
      buildConsultationExtractMessages({
        answer: "I led the rewrite.",
        question: "Tell a story",
        target: { key: "comp", kind: "COMPETENCY", text: "Ownership" },
        targets: [{ key: "comp", kind: "COMPETENCY", text: "Ownership" }],
        profileItems,
      })[1]!.content,
    );
    const polish = JSON.parse(
      buildConsultationPolishMessages({
        answer: "I led the rewrite.",
        story: { situation: null, task: null, action: null, result: null },
        declinedFollowUp: false,
        strengtheningNeeds: [],
        profileItems,
      })[1]!.content,
    );
    expect(extract.personalProfileItems).toEqual(profileItems);
    expect(polish.personalProfileItems).toEqual(profileItems);
  });

  it("does not require polished wording to come only from the seeker's replies", () => {
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    expect(service).not.toContain("resultIgnoresLatestAnswer");
    expect(service).toContain("isRawSeekerResult");
    expect(service).toContain("You may use the supplied Personal Profile");
    const polish = readFileSync("src/lib/prompt-content/consultation.ts", "utf8");
    expect(polish).toContain(
      "You may use profile experience the person did not repeat in the reply",
    );
  });

  it("sends company research to Coach after the Personal Profile", () => {
    const messages = buildConsultationCoachMessages({
      targets: [{ key: "comp", kind: "COMPETENCY", text: "Ownership" }],
      profileItems,
      hiringTeam: [],
      seekerStatedFacts: [],
      companyResearch: {
        companySummary: "CSC sells corporate services.",
        whatTheySell: "Corporate services",
        businessModel: "Services",
        companySizeContext: "Large",
        hiringSignals: ["Hiring RevOps"],
        riskSignals: [],
      },
      askedQuestions: [],
      chronologyRequested: false,
      coveredTargetKeys: [],
    });
    const first = JSON.parse(messages[1]!.content);
    const second = JSON.parse(messages[2]!.content);
    expect(first.personalProfileItems).toEqual(profileItems);
    expect(first.companyResearch.companySummary).toContain("CSC");
    expect(first.hiringTeam).toBeUndefined();
    expect(second.hiringTeam).toEqual([]);
    const keys = Object.keys(first);
    expect(keys.indexOf("personalProfileItems")).toBeLessThan(
      keys.indexOf("companyResearch"),
    );
  });

  it("bumps the consultation prompt version", () => {
    expect(CONSULTATION_PROMPT_VERSION).toBe("25");
  });

  it("passes whyThisCompany into polish messages", () => {
    const polish = JSON.parse(
      buildConsultationPolishMessages({
        answer: "Mission fit.",
        story: { situation: null, task: null, action: null, result: null },
        declinedFollowUp: false,
        whyThisCompany: true,
        strengtheningNeeds: [],
        profileItems,
      })[2]!.content,
    );
    expect(polish.whyThisCompany).toBe(true);
  });

  it("labels the paste field Paste Interviewer Profile everywhere it appears", () => {
    expect(outreachConfig.labels.pasteInterviewerProfile).toBe(
      "Paste Interviewer Profile",
    );
    const stage = readFileSync("src/components/InterviewStagePanel.tsx", "utf8");
    const addPerson = readFileSync(
      "src/components/HiringTeamPersonPicker.tsx",
      "utf8",
    );
    const contacts = readFileSync(
      "src/components/ApplicationOutreachSections.tsx",
      "utf8",
    );
    expect(stage).toContain("pasteInterviewerProfile");
    expect(addPerson).toContain("pasteInterviewerProfile");
    expect(contacts).toContain("pasteInterviewerProfile");
    expect(stage).not.toContain("Paste LinkedIn profile");
    expect(addPerson).not.toContain("Paste LinkedIn profile");
    expect(contacts).not.toContain("Paste LinkedIn profile");
  });
});
