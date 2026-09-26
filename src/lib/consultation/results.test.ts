import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  consultationItemNeedsResultRepair,
  isExactSeekerAnswer,
  isJoinedSeekerAnswers,
  isRawSeekerResult,
  isSeekerAnswerFragment,
  resultIgnoresLatestAnswer,
  shouldEnqueueConsultationResultRepair,
} from "@/lib/consultation/results";
import { consultationConversationCopy } from "@/lib/product-config/consultation";

const managerQuestion =
  "At OpenText or Login VSI, tell me about a sales manager you developed.";
const firstAnswer =
  "I coached a manager who was not inspecting deals. The manager later became an RVP of North America Channels running a team.";
const secondAnswer =
  "I sat with that manager on the weekly forecast, set an inspection cadence, and stayed with it until the team ran it without me.";
const joined = `${firstAnswer}\n${secondAnswer}`;
const fragment =
  "The manager later became an RVP of North America Channels running a team.";
const harperInterview =
  "At Login VSI I coached a sales manager who skipped deal inspection. I sat with them on the weekly forecast, set a cadence, and stayed until the team ran it. That manager later became RVP of North America Channels.";
const harperBullet =
  "Coached a Login VSI sales manager into RVP of North America Channels by installing a weekly deal-inspection cadence.";

describe("Harper result quality", () => {
  it("treats joined replies and answer fragments as raw seeker text, not Harper results", () => {
    expect(isJoinedSeekerAnswers(joined, [firstAnswer, secondAnswer])).toBe(true);
    expect(isSeekerAnswerFragment(fragment, [firstAnswer, secondAnswer])).toBe(
      true,
    );
    expect(isRawSeekerResult(joined, [firstAnswer, secondAnswer])).toBe(true);
    expect(isRawSeekerResult(fragment, [firstAnswer, secondAnswer])).toBe(true);
    expect(isRawSeekerResult(harperInterview, [firstAnswer, secondAnswer])).toBe(
      false,
    );
    expect(isRawSeekerResult(harperBullet, [firstAnswer, secondAnswer])).toBe(
      false,
    );
    expect(isExactSeekerAnswer(firstAnswer, [firstAnswer])).toBe(true);
    expect(isRawSeekerResult(firstAnswer, [firstAnswer])).toBe(true);
    expect(isRawSeekerResult(harperInterview, [firstAnswer])).toBe(false);
    expect(
      resultIgnoresLatestAnswer(firstAnswer, [firstAnswer, secondAnswer]),
    ).toBe(true);
    expect(
      resultIgnoresLatestAnswer(harperInterview, [firstAnswer, secondAnswer]),
    ).toBe(false);
  });

  it("flags a question whose result is raw replies or a leftover fragment", () => {
    const broken = consultationItemNeedsResultRepair({
      questionTurnId: "q1",
      targetKey: "required:manager",
      question: managerQuestion,
      followUp: null,
      seekerAnswers: [
        { id: "s1", body: firstAnswer },
        { id: "s2", body: secondAnswer },
      ],
      statements: [],
      resumeBullet: {
        id: "b1",
        turnId: "s1",
        kind: "RESUME_BULLET",
        status: "DRAFT",
        content: fragment,
        strengtheningNote: null,
      },
      talkingPoint: {
        id: "i1",
        turnId: "s1",
        kind: "INTERVIEW_ANSWER",
        status: "DRAFT",
        content: joined,
        strengtheningNote: null,
      },
    });
    expect(broken).toBe(true);
    expect(
      consultationItemNeedsResultRepair({
        questionTurnId: "q1",
        targetKey: "required:manager",
        question: managerQuestion,
        followUp: null,
        seekerAnswers: [
          { id: "s1", body: firstAnswer },
          { id: "s2", body: secondAnswer },
        ],
        statements: [],
        resumeBullet: {
          id: "b1",
          turnId: "s2",
          kind: "RESUME_BULLET",
          status: "DRAFT",
          content: harperBullet,
          strengtheningNote: null,
        },
        talkingPoint: {
          id: "i1",
          turnId: "s2",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: harperInterview,
          strengtheningNote: null,
        },
      }),
    ).toBe(false);
  });

  it("never falls back to the seeker's raw text in production polish", () => {
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    expect(service).not.toContain("input.answerContext.trim()");
    expect(service).not.toContain("storyProposal?.story?.result ??");
    expect(service).toContain("polishAnswerWithQuality");
    expect(service).toContain("isRawSeekerResult");
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(section).toContain("shouldEnqueueConsultationResultRepair");
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(thread).toContain("Boolean(item.resumeBullet || item.talkingPoint)");
    expect(thread).not.toContain("&& !item.followUp");
    expect(consultationConversationCopy.yourReply).toBe("Your reply");
    expect(consultationConversationCopy.editAnswer).toBe("Edit");
    expect(consultationConversationCopy.saveAnswer).toBe("Save");
    const polish = readFileSync("src/lib/prompt-content/consultation.ts", "utf8");
    expect(polish).toContain("Never return the reply unchanged");
    expect(polish).toContain("Do not add facts from other profile items");
  });

  it("enqueues result repair only when answers changed after the last repair attempt", () => {
    const now = new Date("2026-09-26T19:00:00.000Z");
    const earlier = new Date("2026-09-26T18:00:00.000Z");
    expect(
      shouldEnqueueConsultationResultRepair({
        needsRepair: true,
        busy: false,
        latestSeekerAnswerAt: now,
        lastRepairAttemptAt: null,
      }),
    ).toBe(true);
    expect(
      shouldEnqueueConsultationResultRepair({
        needsRepair: true,
        busy: false,
        latestSeekerAnswerAt: earlier,
        lastRepairAttemptAt: now,
      }),
    ).toBe(false);
    expect(
      shouldEnqueueConsultationResultRepair({
        needsRepair: true,
        busy: false,
        latestSeekerAnswerAt: now,
        lastRepairAttemptAt: earlier,
      }),
    ).toBe(true);
    expect(
      shouldEnqueueConsultationResultRepair({
        needsRepair: true,
        busy: true,
        latestSeekerAnswerAt: now,
        lastRepairAttemptAt: null,
      }),
    ).toBe(false);
    expect(
      shouldEnqueueConsultationResultRepair({
        needsRepair: true,
        busy: false,
        latestSeekerAnswerAt: earlier,
        lastRepairAttemptAt: now,
        lastRepairSucceeded: true,
        stalePromptVersion: true,
      }),
    ).toBe(true);
    expect(
      shouldEnqueueConsultationResultRepair({
        needsRepair: true,
        busy: false,
        latestSeekerAnswerAt: earlier,
        lastRepairAttemptAt: now,
        lastRepairSucceeded: false,
        stalePromptVersion: true,
      }),
    ).toBe(false);
  });
});
