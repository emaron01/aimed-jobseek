import { describe, expect, it } from "vitest";
import {
  dropRepeatedSentences,
  keyPointsFromGrounding,
  matchAnswersByQuestionId,
  storyGroundedInProfile,
  storyNamesUnknownPlace,
  profilePlaceNames,
} from "@/lib/consultation/answer-binding";
import {
  DEFAULT_HARPER_DRAFT_SETTINGS,
  HARPER_DRAFT_SETTINGS_KEY,
  answerLengthInstruction,
  exceedsLengthTarget,
  parseHarperDraftSettings,
  spokenWordsForQuestion,
} from "@/lib/consultation/harper-draft-settings";
import { buildConsultationQaView } from "@/lib/consultation/qa-view";
import {
  ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION,
  bestPracticeDraftsForAnswers,
  buildRoleExpertiseAnswersMessages,
  roleExpertiseFillRange,
  validateRoleExpertiseQuestionChoices,
} from "@/lib/consultation/role-expertise";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const salesEmployer = {
  employer: "OpenText",
  title: "Director of Sales",
  text: "Director of Sales at OpenText",
  itemType: "EXPERIENCE",
};
const nursingSchool = {
  employer: null,
  title: "BSN",
  text: "BSN, State University",
  itemType: "ITEM",
};
const graduateProject = {
  employer: null,
  title: "Capstone project",
  text: "Capstone project on pediatric intake",
  itemType: "ITEM",
};

function choice(text: string, targetKey: string) {
  return {
    text,
    targetKey,
    interviewTypeTag: "focused_competency" as const,
  };
}

function answer(input: {
  questionId?: string;
  challenge: string;
  action: string;
  result: string;
  keyPoints?: string[];
}) {
  return {
    questionId: input.questionId,
    text: "",
    answerFramework: "CAR" as const,
    challenge: input.challenge,
    situation: null,
    task: null,
    action: input.action,
    result: input.result,
    followUpQuestion: input.questionId ? `Follow up for ${input.questionId}` : "Follow up for someone else",
    keyPoints: input.keyPoints,
  };
}

describe("Harper spec batch C", () => {
  it("lands answers on the question id even when the model returns them out of order", () => {
    const choices = [
      choice("Tell me about a time you owned a forecast.", "required:forecast"),
      choice("Tell me about a time you were the surgical first assist.", "required:assist"),
      choice("Tell me about your capstone project.", "required:capstone"),
    ];
    const drafts = bestPracticeDraftsForAnswers(
      choices,
      [
        answer({
          questionId: "required:capstone",
          challenge: "My Capstone project studied pediatric intake.",
          action: "I mapped the intake steps.",
          result: "The clinic adopted the checklist.",
        }),
        answer({
          questionId: "required:forecast",
          challenge: "At OpenText the forecast was late.",
          action: "I moved the inspection to Monday.",
          result: "Forecast confidence rose the next quarter.",
        }),
        answer({
          questionId: "required:assist",
          challenge: "At State University I was the surgical first assist.",
          action: "I anticipated the next instrument.",
          result: "The case finished without a delay.",
        }),
      ],
      [],
      [salesEmployer, nursingSchool, graduateProject],
    );
    expect(drafts[0]?.content).toContain("OpenText");
    expect(drafts[0]?.followUpQuestion).toBe("Follow up for required:forecast");
    expect(drafts[1]?.content).toContain("State University");
    expect(drafts[1]?.followUpQuestion).toBe("Follow up for required:assist");
    expect(drafts[2]?.content).toContain("Capstone project");
    expect(drafts[2]?.followUpQuestion).toBe("Follow up for required:capstone");

    const unknown = matchAnswersByQuestionId(choices, [
      answer({
        questionId: "required:not-a-question",
        challenge: "At Mercy General I covered a shift.",
        action: "I took the assignment.",
        result: "The unit stayed covered.",
      }),
    ]);
    expect(unknown.matched.every((item) => item == null)).toBe(true);
    expect(unknown.unknownIds).toEqual(["required:not-a-question"]);
    const misplaced = bestPracticeDraftsForAnswers(
      choices,
      [
        answer({
          questionId: "required:not-a-question",
          challenge: "At Mercy General I covered a shift.",
          action: "I took the assignment.",
          result: "The unit stayed covered.",
        }),
      ],
      [],
      [salesEmployer, nursingSchool, graduateProject],
    );
    expect(misplaced.every((draft) => draft.content === "")).toBe(true);
  });

  it("drops a sentence that repeats an earlier sentence in the same answer", () => {
    const repeated =
      "At OpenText I rebuilt the Monday forecast. I coached the managers through the new cadence. At OpenText I rebuilt the Monday forecast.";
    expect(dropRepeatedSentences(repeated).match(/rebuilt the Monday forecast/g)?.length).toBe(1);
  });

  it("stores a story that names a profile place, including a customer named with at", () => {
    const names = profilePlaceNames([salesEmployer, nursingSchool, graduateProject]);
    expect(storyGroundedInProfile("I trained at State University.", names)).toBe(true);
    expect(storyGroundedInProfile("At OpenText I owned the forecast.", names)).toBe(true);
    expect(storyNamesUnknownPlace("At Mercy General I covered a shift.", names)).toBe(true);

    const kept = bestPracticeDraftsForAnswers(
      [choice("Tell me about a time you owned a forecast.", "required:forecast")],
      [
        answer({
          questionId: "required:forecast",
          challenge: "At OpenText the forecast slipped.",
          action: "I rebuilt the inspection.",
          result: "The commit landed on Monday.",
        }),
      ],
      [],
      [salesEmployer],
    );
    expect(kept[0]?.content).toContain("OpenText");

    const school = bestPracticeDraftsForAnswers(
      [choice("Tell me about a time you were the surgical first assist.", "required:assist")],
      [
        answer({
          questionId: "required:assist",
          challenge: "At State University I was the surgical first assist.",
          action: "I anticipated the next instrument.",
          result: "The case stayed on time.",
        }),
      ],
      [],
      [nursingSchool],
    );
    expect(school[0]?.content).toContain("State University");

    const customer = bestPracticeDraftsForAnswers(
      [choice("Tell me about a time you won an enterprise deal.", "required:deal")],
      [
        answer({
          questionId: "required:deal",
          challenge: "At OpenText I worked a $1.3MM opportunity at Bank of America.",
          action: "I ran the evaluation with the buying group.",
          result: "We won the contract.",
        }),
      ],
      [],
      [salesEmployer],
    );
    expect(customer[0]?.content).toContain(
      "At OpenText I worked a $1.3MM opportunity at Bank of America.",
    );
    expect(customer[0]?.content).toContain("We won the contract.");

    const otherWorkplace = bestPracticeDraftsForAnswers(
      [choice("Tell me about a time you covered a unit.", "required:unit")],
      [
        answer({
          questionId: "required:unit",
          challenge: "At Mercy General I covered the night shift.",
          action: "I took the assignment.",
          result: "The unit stayed covered.",
        }),
      ],
      [],
      [nursingSchool],
    );
    expect(otherWorkplace[0]?.content).toContain("At Mercy General I covered the night shift.");

    const hypothetical = bestPracticeDraftsForAnswers(
      [choice("Tell me about a time you would handle a new account.", "required:would")],
      [
        answer({
          questionId: "required:would",
          challenge: "I would start with two customer visits at OpenText.",
          action: "I would map the buying group.",
          result: "The plan would be ready.",
        }),
      ],
      [],
      [salesEmployer],
    );
    expect(hypothetical[0]?.content).toContain("I would start with two customer visits at OpenText.");
  });

  it("does not add a best-practice question for a target that already has a gap question", () => {
    const asked = {
      text: "Tell me about a time you owned a forecast.",
      answered: false,
      ignored: false,
      targetKey: "required:forecast",
      followUp: false,
    };
    const result = validateRoleExpertiseQuestionChoices({
      questions: [
        {
          text: "Tell me about a time you owned a forecast.",
          interviewTypeTag: "focused_competency",
        },
        {
          text: "How do you coach a new sales representative?",
          interviewTypeTag: "focused_competency",
        },
      ],
      minCount: 0,
      maxCount: 8,
      askedQuestions: [asked],
      chronologyAlreadyAsked: true,
    });
    expect(result.valid.map((question) => question.text)).toEqual([
      "How do you coach a new sales representative?",
    ]);
    expect(result.issues.join(" ")).toContain("already has a gap question");
  });

  it("asks for key points on a complex question and rewrites an over-long answer once", () => {
    const complex =
      "Tell me about a time you owned the forecast and coached the managers through a missed commit?";
    const points = ["Monday inspection", "Two managers", "Commit moved up"];
    const drafts = bestPracticeDraftsForAnswers(
      [choice(complex, "required:forecast")],
      [
        answer({
          questionId: "required:forecast",
          challenge: "At OpenText the forecast slipped and two managers missed the commit.",
          action: "I moved the inspection to Monday and coached both managers.",
          result: "The next commit landed on time.",
          keyPoints: points,
        }),
      ],
      [],
      [salesEmployer],
    );
    expect(drafts[0]?.grounding.keyPoints).toEqual(points);
    const view = buildConsultationQaView({
      turns: [
        {
          id: "q1",
          speaker: "CONSULTANT",
          body: complex,
          targetKey: "required:forecast",
          followUp: false,
          sequence: 1,
        },
      ],
      statements: [
        {
          id: "s1",
          turnId: "q1",
          kind: "INTERVIEW_ANSWER",
          status: "APPROVED",
          content: drafts[0]?.content ?? "",
          strengtheningNote: null,
          groundingJson: drafts[0]?.grounding,
        },
      ],
    });
    expect(view.questions[0]?.statements[0]?.keyPoints).toEqual(points);
    expect(keyPointsFromGrounding(drafts[0]?.grounding)).toEqual(points);

    const long = Array.from({ length: 40 }, () => "word").join(" ");
    expect(exceedsLengthTarget(long, 30)).toBe(true);
    expect(exceedsLengthTarget("twelve words is still inside a small margin here today", 8)).toBe(false);
    const messages = buildRoleExpertiseAnswersMessages({
      questions: [choice(complex, "required:forecast")],
      careerStage: "late_career",
      jobSources: {},
      profileItems: [],
      settings: { ...DEFAULT_HARPER_DRAFT_SETTINGS, bestPracticeWords: 150 },
    });
    expect(messages[0]?.content).toContain(answerLengthInstruction(150));
    expect(messages[0]?.content).toContain("Prompt version: 9");
    const payload = JSON.parse(messages[1]?.content ?? "{}") as {
      questions: Array<{ id: string; words: number }>;
    };
    expect(payload.questions[0]).toMatchObject({ id: "required:forecast", words: 150 });
    expect(
      spokenWordsForQuestion({
        settings: DEFAULT_HARPER_DRAFT_SETTINGS,
        text: "Why do you want to work here?",
        targetKey: "why-this-company",
        walkThrough: false,
      }),
    ).toBe(120);
    expect(
      spokenWordsForQuestion({
        settings: DEFAULT_HARPER_DRAFT_SETTINGS,
        text: "Walk me through your recent roles.",
        targetKey: "chronology",
        walkThrough: true,
        recentRoleCount: 3,
      }),
    ).toBe(120);
    expect(ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION).toBe("9");
    expect(CONSULTATION_PROMPT_VERSION).toBe("39");
  });

  it("reads Super Admin settings for the best-practice count and the length targets", () => {
    const settings = parseHarperDraftSettings({
      bestPracticeCount: 4,
      questionLimit: 10,
      gapWords: 90,
      bestPracticeWords: 80,
      whyThisCompanyWords: 60,
      walkThroughWordsPerRole: 20,
      walkThroughWordsTotal: 100,
      resumeBulletWords: 12,
    });
    expect(roleExpertiseFillRange(3, settings)).toEqual({ minCount: 4, maxCount: 4 });
    expect(roleExpertiseFillRange(8, settings)).toEqual({ minCount: 2, maxCount: 2 });
    expect(
      spokenWordsForQuestion({
        settings,
        text: "How do you coach a representative?",
        targetKey: "required:coach",
        walkThrough: false,
      }),
    ).toBe(90);
    expect(
      spokenWordsForQuestion({
        settings,
        text: "How do you open a new territory?",
        targetKey: "role-expertise:territory",
        walkThrough: false,
      }),
    ).toBe(80);
    expect(HARPER_DRAFT_SETTINGS_KEY).toBe("harper.drafts");
    expect(parseHarperDraftSettings(null)).toEqual(DEFAULT_HARPER_DRAFT_SETTINGS);
    const page = readFileSync(resolve("src/app/platform/harper/page.tsx"), "utf8");
    const action = readFileSync(resolve("src/app/actions/platform-settings.ts"), "utf8");
    expect(page).toContain("HarperDraftSettingsForm");
    expect(action).toContain("HARPER_DRAFT_SETTINGS_KEY");
    expect(action).not.toContain("generateStructured");
  });
});
