import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

import { AdditionalInterviewPrepQa } from "@/components/AdditionalInterviewPrepQa";
import { CheatSheetCoachItems } from "@/components/CheatSheetCoachItems";
import { CheatSheetPersonBody } from "@/components/CheatSheetPersonBody";
import { QuestionList } from "@/components/ConsultationThread";
import { HarperDraftProvider } from "@/components/HarperDraftStore";
import type { CheatSheetPersonSection } from "@/lib/application-summary/contract";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import { consultationConversationCopy } from "@/lib/product-config";

const openQuestion = (
  questionTurnId: string,
  targetKey: string,
  question: string,
): ConsultationQaItem => ({
  questionTurnId,
  targetKey,
  question,
  followUp: null,
  seekerAnswers: [],
  statements: [],
  resumeBullet: null,
  talkingPoint: null,
  pendingDraftTalkingPoint: null,
  pendingDraftResumeBullet: null,
  ignored: false,
});

const coachQuestion = openQuestion(
  "q_coach",
  "cheatSheet:likely:1",
  "Tell me how you run a weekly forecast.",
);
const prepQuestion = openQuestion(
  "q_prep",
  "prep:other",
  "Tell me about a time you repaired a handoff.",
);

const personSection: CheatSheetPersonSection = {
  sectionKey: "contact:c1",
  roleId: "role_1",
  contactId: "c1",
  heading: "Priya Nair",
  sectionKind: "HIRING_MANAGER",
  caresAbout: [{ text: "Forecast quality", seekerConnection: "", supports: [] }],
  positioningStatements: [{ text: "I inspect the commit.", supports: [] }],
  keyStatements: [{ text: "I name slip risk.", supports: [] }],
  likelyQuestions: [
    {
      id: "likely:1",
      prompt: coachQuestion.question,
      sampleAnswer: "I rebuilt the Monday commit.",
      harperQuestion: null,
      supports: [],
    },
  ],
  questionsToAsk: [{ text: "How do you review the commit?", followUps: [], supports: [] }],
  bestMaterial: [],
  storyIds: [],
};

const listProps = {
  campaignId: "camp_1",
  canEdit: true,
  showReply: true,
  pendingTarget: null,
  jobsActive: false,
  onSubmitStart: () => undefined,
};

function renderPersonSection() {
  return renderToStaticMarkup(
    createElement(
      HarperDraftProvider,
      null,
      createElement(CheatSheetPersonBody, {
        campaignId: "camp_1",
        canEdit: true,
        sectionKey: "contact:c1",
        section: personSection,
        notes: [],
        personaBuilt: true,
        personaId: "role_1",
        coachQaItems: [coachQuestion],
        additionalPrepQuestions: [prepQuestion],
      }),
    ),
  );
}

describe("Cheat Sheet Harper providers", () => {
  it("renders the person section, coach questions, and additional prep with Save Answer", () => {
    const html = renderPersonSection();
    expect(html).toContain(coachQuestion.question);
    expect(html).toContain(prepQuestion.question);
    expect(html).toContain('data-testid="cheat-sheet-coach-harper-qa"');
    expect(html).toContain('data-testid="additional-interview-prep-qa"');
    expect(html).toContain(consultationConversationCopy.threadReply);
    expect(html.match(/Save Answer/g)?.length).toBeGreaterThanOrEqual(2);

    const coach = renderToStaticMarkup(
      createElement(
        HarperDraftProvider,
        null,
        createElement(CheatSheetCoachItems, {
          campaignId: "camp_1",
          canEdit: true,
          items: personSection.likelyQuestions,
          qaItems: [coachQuestion],
        }),
      ),
    );
    expect(coach).toContain(consultationConversationCopy.threadReply);
    expect(coach).toContain(coachQuestion.question);

    const prep = renderToStaticMarkup(
      createElement(
        HarperDraftProvider,
        null,
        createElement(AdditionalInterviewPrepQa, {
          campaignId: "camp_1",
          questions: [prepQuestion],
          canEdit: true,
        }),
      ),
    );
    expect(prep).toContain(consultationConversationCopy.threadReply);
    expect(prep).toContain(prepQuestion.question);
  });

  it("fails when QuestionList renders without HarperDraftProvider", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(QuestionList, {
          ...listProps,
          questions: [coachQuestion],
        }),
      ),
    ).toThrow(/useHarperDraft must be used within HarperDraftProvider/);

    const provided = renderToStaticMarkup(
      createElement(
        HarperDraftProvider,
        null,
        createElement(QuestionList, {
          ...listProps,
          questions: [coachQuestion],
        }),
      ),
    );
    expect(provided).toContain(consultationConversationCopy.threadReply);
  });

  it("requires HarperDraftProvider above every rendered QuestionList", () => {
    const hosts = questionListHosts();
    expect(hosts).toEqual(
      expect.arrayContaining([
        "AdditionalInterviewPrepQa",
        "CheatSheetCoachItems",
        "ConsultationStanding",
        "HarperPersonInlineProfile",
        "StandingRequirementList",
      ]),
    );
    for (const host of hosts) {
      const status = providerStatus(host);
      expect(status, host).not.toBe("missing");
    }
  });
});

const PROVIDER_OPEN = "<HarperDraftProvider";
const PROVIDER_CLOSE = "</HarperDraftProvider>";

function sourceFiles(): Array<{ path: string; text: string }> {
  const root = join(process.cwd(), "src");
  const found: Array<{ path: string; text: string }> = [];
  const queue = [root];
  while (queue.length > 0) {
    const dir = queue.pop();
    if (!dir) break;
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        queue.push(path);
        continue;
      }
      if (!path.endsWith(".tsx")) continue;
      found.push({ path, text: readFileSync(path, "utf8") });
    }
  }
  return found;
}

const files = sourceFiles();

function questionListHosts(): string[] {
  const hosts = new Set<string>();
  for (const file of files) {
    const re = /<QuestionList[\s>]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(file.text))) {
      const host = enclosingComponent(file.text, match.index);
      if (host) hosts.add(host);
    }
  }
  return [...hosts];
}

function enclosingComponent(text: string, index: number): string | null {
  const before = text.slice(0, index);
  const matches = [...before.matchAll(/function ([A-Z][A-Za-z0-9]*)\s*\(/g)];
  return matches.at(-1)?.[1] ?? null;
}

function usagesOf(component: string): Array<{ text: string; index: number }> {
  const re = new RegExp(`<${component}[\\s>]`, "g");
  const uses: Array<{ text: string; index: number }> = [];
  for (const file of files) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(file.text))) {
      uses.push({ text: file.text, index: match.index });
    }
  }
  return uses;
}

function wrappedByDraftProvider(text: string, index: number): boolean {
  let depth = 0;
  let cursor = 0;
  while (cursor < index) {
    const nextOpen = text.indexOf(PROVIDER_OPEN, cursor);
    const nextClose = text.indexOf(PROVIDER_CLOSE, cursor);
    const openFirst =
      nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose) && nextOpen < index;
    if (openFirst) {
      depth += 1;
      cursor = nextOpen + PROVIDER_OPEN.length;
      continue;
    }
    if (nextClose !== -1 && nextClose < index) {
      depth -= 1;
      cursor = nextClose + PROVIDER_CLOSE.length;
      continue;
    }
    break;
  }
  return depth > 0;
}

function providerStatus(
  component: string,
  seen = new Set<string>(),
): "provided" | "not-rendered" | "missing" {
  if (seen.has(component)) return "missing";
  const nextSeen = new Set(seen);
  nextSeen.add(component);
  const uses = usagesOf(component);
  if (uses.length === 0) return "not-rendered";
  let sawProvided = false;
  for (const use of uses) {
    if (wrappedByDraftProvider(use.text, use.index)) {
      sawProvided = true;
      continue;
    }
    const parent = enclosingComponent(use.text, use.index);
    if (!parent) return "missing";
    const parentStatus = providerStatus(parent, nextSeen);
    if (parentStatus === "missing") return "missing";
    if (parentStatus === "provided") sawProvided = true;
  }
  return sawProvided ? "provided" : "not-rendered";
}
