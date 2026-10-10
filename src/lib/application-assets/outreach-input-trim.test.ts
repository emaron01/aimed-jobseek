import { describe, expect, it } from "vitest";
import { fingerprintPaidCallInputs } from "@/lib/ai/paid-call-gate";
import {
  buildOutreachAssetMessages,
  buildOutreachFactSelectionMessages,
  OUTREACH_INPUT_LIMITS,
  selectOutreachSeekerMaterial,
} from "@/lib/application-assets/prompt";
import {
  outreachAssetFingerprint,
  outreachFactSelectionFingerprint,
} from "@/lib/application-assets/outreach-paid-inputs";
import type { ReadyApplicationGenerationContext } from "@/lib/generation/context";
import type { OutreachGenerationInput } from "@/lib/application-assets/outreach-types";

const FORECAST =
  "I owned the enterprise forecast and cut slipped deals by reviewing pipeline every week.";
const RAW_POSTING = `RAW_POSTING_MARKER ${"posting paragraph ".repeat(4000)}`;
const PROFILE_MARKER = `PROFILE_OBJECT_MARKER ${"profile paragraph ".repeat(2000)}`;
const OLD_VOICE = "OLDER_VOICE_SAMPLE_MARKER I used to write long formal letters.";
const NEW_VOICE = "I write in short plain sentences.";

function siftAshleyContext(): ReadyApplicationGenerationContext {
  return {
    organizationId: "org",
    userId: "user",
    campaign: {
      id: "cmux4btmv0005p32prkebgtka",
      name: "Sift",
      ownerUserId: "user",
      applicationGuidance: "GUIDANCE_MARKER tailor every line",
      appliedAt: new Date("2026-09-20T00:00:00.000Z"),
      applicationProgress: "APPLIED",
    },
    profile: {
      schemaVersion: 1,
      identity: { fullName: PROFILE_MARKER },
      direction: {},
      experience: [],
      skills: [],
      education: [],
      credentials: [],
    },
    requirement: {
      id: "req",
      title: "Director of Sales",
      companyName: "Sift",
      location: "Remote",
      workArrangement: null,
      seniority: "director",
      reportingLine: null,
      compensationRange: null,
      responsibilities: ["Lead enterprise sales"],
      requiredItems: ["Own the enterprise forecast"],
      preferredItems: ["PREFERRED_MARKER fraud tools"],
      scorecard: { marker: "SCORECARD_MARKER", notes: "x".repeat(4000) },
      rawText: RAW_POSTING,
    },
    companyResearch: {
      id: "research",
      companySummary: "Sift sells digital trust.",
      whatTheySell: "Fraud prevention",
      customerTypes: [],
      primaryMarkets: [],
      businessModel: null,
      companySizeContext: null,
      hiringSignals: [],
      riskSignals: [],
      jobFocus: "JOB_FOCUS_MARKER enterprise fraud",
      jobFocusDetail: "JOB_FOCUS_DETAIL_MARKER",
      researchSources: [],
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    },
    persona: {
      id: "ashley",
      name: "Ashley Cobb",
      suggestionKey: "recruiter",
      likelyTitles: ["Sales Recruiter"],
      profileJson: {
        narrative: {
          overview: { text: "Ashley recruits enterprise sales leaders." },
          pressures: [{ text: "Ashley is under pressure on pipeline quality." }],
          impact: { text: "This hire changes how open sales roles are filled." },
          concerns: [{ text: "CONCERN_MARKER do not send" }],
          needs: [{ text: "NEEDS_MARKER do not send" }],
          evaluates: [{ text: "EVALUATES_MARKER do not send" }],
          talkingPoints: [{ text: "TALKING_MARKER do not send" }],
          communication: [{ text: "COMMUNICATION_MARKER do not send" }],
        },
      },
    },
    hiringManagerPersonaId: null,
    hiringManagerContactName: null,
    assessments: [],
    approvedStatements: [
      { id: "st-forecast", kind: "INTERVIEW_ANSWER", content: FORECAST, turnId: "t1", targetKey: null },
      { id: "st-noise", kind: "INTERVIEW_ANSWER", content: "I bake bread on Sundays.", turnId: "t2", targetKey: null },
    ],
    stories: [
      {
        id: "story-forecast",
        situation: "STORY_SITUATION_MARKER a quiet quarter",
        task: "TASK_MARKER unrelated gardening",
        action: "ACTION_MARKER watering plants",
        result: "I rebuilt the enterprise forecast so sellers could see slipped deals.",
        verbatimAnswer: null,
        interviewAnswer: null,
        resumeBullet: null,
        interviewAnswerApprovedAt: null,
        resumeBulletApprovedAt: null,
      },
      {
        id: "story-noise",
        situation: "I planned a hiking trip.",
        task: "Pack a bag",
        action: "Walked the trail",
        result: "Reached the lake",
        verbatimAnswer: null,
        interviewAnswer: null,
        resumeBullet: null,
        interviewAnswerApprovedAt: null,
        resumeBulletApprovedAt: null,
      },
    ],
    voiceSamples: [
      { id: "voice-new", label: "New", sampleText: NEW_VOICE, createdAt: new Date("2026-10-01") },
      { id: "voice-old", label: "Old", sampleText: OLD_VOICE, createdAt: new Date("2026-01-01") },
    ],
    seekerAnswers: [{ id: "reply-1", text: "TRANSCRIPT_MARKER the full seeker transcript" }],
    sources: [
      { id: "profile:forecast", text: FORECAST, category: "PROFILE_FACT", url: null },
      { id: "profile:noise", text: "I collect stamps from coastal towns.", category: "PROFILE_FACT", url: null },
      { id: "statement:st-forecast", text: FORECAST, category: "APPROVED_STATEMENT", url: null },
      { id: "statement:st-noise", text: "I bake bread on Sundays.", category: "APPROVED_STATEMENT", url: null },
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `statement:rel-${index + 1}`,
        text: `I reviewed the enterprise forecast with the sales team, note ${index + 1}.`,
        category: "APPROVED_STATEMENT" as const,
        url: null,
      })),
      {
        id: "reply:reply-1",
        text: "I told Harper the recruiter cares about pipeline quality for enterprise sales.",
        category: "SEEKER_REPLY",
        url: null,
      },
      {
        id: "reply:transcript",
        text: "TRANSCRIPT_MARKER the full seeker transcript should not be dumped.",
        category: "SEEKER_REPLY",
        url: null,
      },
      {
        id: "seeker-bullet:enterprise",
        text: "Resume bullet: led enterprise sales teams through a forecast reset.",
        category: "SEEKER_REPLY",
        url: null,
      },
      { id: "job:posting", text: RAW_POSTING, category: "JOB_REQUIREMENT", url: null },
      {
        id: "persona:ashley",
        text: `Ashley Cobb. Ashley recruits for pipeline quality. ${JSON.stringify({ narrative: { concerns: "CONCERN_MARKER" } })}`,
        category: "PERSONA",
        url: null,
      },
      {
        id: "application:status",
        text: "Applied through the employer portal on 2026-09-20.",
        category: "APPLICATION",
        url: null,
      },
    ],
  } as unknown as ReadyApplicationGenerationContext;
}

const selectedFacts = [
  { candidateId: "research:summary", text: "Sift sells digital trust and fraud prevention to enterprises." },
  { candidateId: "research:hiring", text: "Sift is hiring enterprise sales leaders for the fraud platform." },
  { candidateId: "research:customers", text: "Sift's customers are marketplaces that need payment fraud review." },
];

function emailInput(
  overrides: Partial<OutreachGenerationInput> = {},
): OutreachGenerationInput & { selectedFacts: typeof selectedFacts } {
  return {
    context: siftAshleyContext(),
    type: "EMAIL",
    greeting: "Hi Ashley,",
    signerName: "Alex Chen",
    confirmedHiringManagerRole: false,
    includeRedirect: false,
    purpose: "PROACTIVE",
    emailLength: "MEDIUM",
    priorMessage: null,
    interviewStageNotes: null,
    mentionApplied: true,
    regenerationInstruction: null,
    qualityFeedback: [],
    selectedFacts,
    ...overrides,
  };
}

function messageText(messages: Array<{ content: string }>): string {
  return messages.map((message) => message.content).join("\n");
}

function previousLayoutChars(context: ReadyApplicationGenerationContext): number {
  const payload = JSON.stringify({
    personalProfile: context.profile,
    jobRequirement: {
      title: context.requirement.title,
      companyName: context.requirement.companyName,
      responsibilities: context.requirement.responsibilities,
      requiredItems: context.requirement.requiredItems,
      scorecard: context.requirement.scorecard,
      rawText: context.requirement.rawText,
    },
    approvedStatements: context.approvedStatements,
    approvedStories: context.stories,
    seekerAnswers: context.seekerAnswers,
    voiceSamples: context.voiceSamples,
    citableSources: context.sources,
    selectedFacts,
  });
  return payload.length;
}

describe("outreach input trim", () => {
  it("sends the Sift / Ashley email facts once and drops the removed dumps", () => {
    const input = emailInput();
    const messages = buildOutreachAssetMessages(input);
    const text = messageText(messages);
    const sources = JSON.parse(messages[1]!.content) as {
      citableSources: Array<{ id: string; text: string }>;
      voiceSample?: { text: string };
      personalProfile?: unknown;
    };
    const controls = JSON.parse(messages[2]!.content) as Record<string, unknown>;

    for (const fact of selectedFacts) {
      expect(text.split(fact.text).length - 1).toBe(1);
    }
    expect(text.split(FORECAST).length - 1).toBe(1);
    expect(sources.citableSources.map((source) => source.id)).toEqual(
      expect.arrayContaining([
        "persona:ashley",
        "job:posting",
        "research:summary",
        "profile:forecast",
        "reply:reply-1",
        "seeker-bullet:enterprise",
        "story:story-forecast",
      ]),
    );
    expect(sources.citableSources.some((source) => source.id === "statement:st-forecast")).toBe(
      false,
    );
    expect(text).toContain("pipeline quality");
    expect(text).toContain("Director of Sales");
    expect(text).toContain("Own the enterprise forecast");
    expect(text).not.toContain("CONCERN_MARKER");
    expect(text).not.toContain("NEEDS_MARKER");
    expect(text).not.toContain("EVALUATES_MARKER");
    expect(text).not.toContain("PROFILE_OBJECT_MARKER");
    expect(text).not.toContain("RAW_POSTING_MARKER");
    expect(text).not.toContain("SCORECARD_MARKER");
    expect(text).not.toContain("TRANSCRIPT_MARKER");
    expect(text).not.toContain("STORY_SITUATION_MARKER");
    expect(text).not.toContain("JOB_FOCUS_MARKER");
    expect(text).not.toContain("GUIDANCE_MARKER");
    expect(text).not.toContain(OLD_VOICE);
    expect(sources.voiceSample?.text).toBe(NEW_VOICE);
    expect(sources.personalProfile).toBeUndefined();
    expect(text).not.toContain("personalProfile");
    expect(text).not.toContain("approvedStatements");
    expect(text).not.toContain("approvedStories");
    expect(text).not.toContain("seekerAnswers");
    expect(text).not.toContain("seekerVoiceInstruction");
    expect(text).not.toContain("scorecard");
    expect(controls.applicationProgress).toBeUndefined();
    expect(controls.priorMessages).toBeUndefined();
    expect(controls.interviewStageNotes).toBeUndefined();

    const again = buildOutreachAssetMessages(input);
    expect(again).toEqual(messages);
    expect(outreachAssetFingerprint(input)).toBe(outreachAssetFingerprint(input));

    const chars = text.length;
    const tokens = Math.ceil(chars / 4);
    const beforeChars = previousLayoutChars(input.context);
    expect(chars).toBeLessThan(OUTREACH_INPUT_LIMITS.messageCharCap);
    expect(tokens).toBeLessThanOrEqual(5_000);
    expect(beforeChars).toBeGreaterThan(chars);
    expect(chars).toBe(6_673);
    expect(tokens).toBe(1_669);
  });

  it("ranks seeker material from every source and keeps ties in source order", () => {
    const context = siftAshleyContext();
    const personaText = "Ashley Cobb Sales Recruiter pipeline quality";
    const jobText = "Director of Sales Sift Own the enterprise forecast";
    const first = selectOutreachSeekerMaterial({ context, personaText, jobText });
    const second = selectOutreachSeekerMaterial({ context, personaText, jobText });
    expect(second).toEqual(first);
    expect(first.facts.map((fact) => fact.id)).toEqual(
      expect.arrayContaining(["profile:forecast", "seeker-bullet:enterprise"]),
    );
    expect(first.statements.map((fact) => fact.id)).toContain("reply:reply-1");
    expect(first.stories.map((fact) => fact.id)).toContain("story:story-forecast");
    expect(first.facts.some((fact) => fact.id === "statement:st-forecast")).toBe(false);
    expect(first.statements.some((fact) => fact.text === FORECAST)).toBe(false);
  });

  it("includes prior messages and notes for follow-up and thank-you", () => {
    const notes = "We discussed enterprise forecast ownership and pipeline quality.";
    const priorMessages = [
      { subject: "Earlier note", body: "I wrote last week about the forecast." },
      { subject: null, body: "The first note mentioned Sift." },
    ];
    const followUp = JSON.parse(
      buildOutreachAssetMessages(
        emailInput({
          purpose: "FOLLOW_UP",
          priorMessage: priorMessages[0],
          priorMessages,
          interviewStageNotes: notes,
        }),
      )[2]!.content,
    ) as { priorMessages: typeof priorMessages; interviewStageNotes: string };
    expect(followUp.priorMessages).toEqual(priorMessages);
    expect(followUp.interviewStageNotes).toBe(notes);

    const thankYou = JSON.parse(
      buildOutreachAssetMessages(
        emailInput({
          purpose: "THANK_YOU",
          priorMessage: priorMessages[0],
          interviewStageNotes: notes,
          mentionApplied: false,
        }),
      )[2]!.content,
    ) as { priorMessages: unknown[]; interviewStageNotes: string };
    expect(thankYou.priorMessages).toEqual([priorMessages[0]]);
    expect(thankYou.interviewStageNotes).toBe(notes);
  });

  it("fact selection sends the job title, company, and candidates only", () => {
    const context = siftAshleyContext();
    const messages = buildOutreachFactSelectionMessages({
      context,
      purpose: "PROACTIVE",
      candidates: selectedFacts,
    });
    const text = messageText(messages);
    expect(messages).toHaveLength(2);
    expect(text).toContain("Director of Sales");
    expect(text).toContain("Sift");
    expect(text).toContain("research:summary");
    expect(text).not.toContain("SCORECARD_MARKER");
    expect(text).not.toContain("RAW_POSTING_MARKER");
    expect(text).not.toContain("JOB_FOCUS_DETAIL_MARKER");
    expect(text).not.toContain("companyResearch");
    const fingerprint = outreachFactSelectionFingerprint({
      context,
      purpose: "PROACTIVE",
      candidates: selectedFacts,
    });
    const previous = fingerprintPaidCallInputs({
      schemaName: "email_company_fact_selection",
      messages: [
        { role: "system", content: messages[0]!.content },
        {
          role: "user",
          content: JSON.stringify({
            jobRequirement: { scorecard: context.requirement.scorecard, rawText: RAW_POSTING },
            companyResearch: context.companyResearch,
          }),
        },
        {
          role: "user",
          content: JSON.stringify({ purpose: "PROACTIVE", candidates: selectedFacts }),
        },
      ],
    });
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).not.toBe(previous);
  });
});
