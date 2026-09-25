import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveContactPersonaDecision } from "@/lib/campaign/contact-persona";
import {
  addApplicationContact,
  ingestNamedJobContacts,
  matchHiringTeamRoleFromTitle,
  updateApplicationContactRole,
} from "@/lib/application/contacts";
import {
  applicationReminderAnchor,
  isApplicationReminderDue,
  parseOptionalReminderDay,
  reminderDaysFromPolicy,
  reminderDueAt,
  validateApplicationReminderInput,
} from "@/lib/cadence/application-reminders";
import { outreachEmailHandoff } from "@/lib/application-assets/handoff";
import {
  appliedMentionErrors,
  askAndRedirectCountErrors,
  conversationThankErrors,
  finalSentencePunctuationErrors,
  followUpLengthErrors,
  genericRelevanceErrors,
  hiringManagerClaimErrors,
  notesDescribeConversation,
  outreachLimitErrors,
  redirectLineErrors,
  outreachSupportErrors,
  thankYouAnswerSources,
  thankYouNotesErrors,
  thankYouSubjectErrors,
  threadRepetitionErrors,
  unsupportedRecipientFactErrors,
} from "@/lib/application-assets/outreach";
import {
  composeOutreachText,
  type LinkedinNoteAssetContent,
} from "@/lib/application-assets/contract";
import { buildOutreachAssetMessages } from "@/lib/application-assets/prompt";
import {
  anyListFeatureEnabled,
  connectionNoteBodyBudget,
  features,
  interviewConfig,
  outreachConfig,
  outreachGreeting,
  shouldIncludeRedirect,
} from "@/lib/product-config";
import { buildSidebarNavItems } from "@/lib/auth/user-menu";
import { buildHomeSetupRail } from "@/lib/workflow/home-setup-rail";
import { voiceReadiness } from "@/lib/voice/types";
import { hasTestDatabase } from "@/test/database";

describe("sales-only entry points", () => {
  it("hides lists, bulk scoring, and Email Connection", () => {
    expect(anyListFeatureEnabled()).toBe(false);
    expect(features.listImport).toBe(false);
    expect(features.listBulkValidation).toBe(false);
    expect(features.listBulkScoring).toBe(false);
    expect(features.emailConnection).toBe(false);
    const nav = buildSidebarNavItems({
      hasOrganization: true,
      isPlatformOperator: false,
    });
    expect(nav.some((item) => item.href === "/lists")).toBe(false);
    expect(nav.some((item) => item.href === "/settings/email")).toBe(false);
    const rail = buildHomeSetupRail({
      voice: voiceReadiness(3),
      productTotal: 1,
      productApprovedCount: 1,
      productIncomplete: [],
      icpCount: 1,
      emailConnected: false,
      emailReconnectRequired: false,
    });
    expect(rail.some((step) => step.key === "email")).toBe(false);
    const campaignPage = readFileSync("src/app/(app)/campaigns/[id]/page.tsx", "utf8");
    expect(campaignPage).toContain("anyListFeatureEnabled()");
    expect(campaignPage).toContain('anyListFeatureEnabled() && currentStage === "list"');
    expect(campaignPage).toMatch(/anyListFeatureEnabled\(\)\s*\?\s*`Stage \$\{/);
    expect(campaignPage).not.toMatch(/description=\{`Stage \$\{/);
    const workspace = readFileSync(
      "src/components/EmailSequenceWorkspace.tsx",
      "utf8",
    );
    expect(workspace).toContain("features.emailConnection");
    expect(workspace).toContain("Send with Microsoft 365");
  });

  it("does not require MICROSOFT_* variables at import time", async () => {
    const previous = {
      MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
      MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
      MICROSOFT_REDIRECT_URI: process.env.MICROSOFT_REDIRECT_URI,
    };
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
    delete process.env.MICROSOFT_REDIRECT_URI;
    await expect(import("@/lib/mailbox/data")).resolves.toBeDefined();
    await expect(import("@/lib/workflow/home")).resolves.toBeDefined();
    if (previous.MICROSOFT_CLIENT_ID) {
      process.env.MICROSOFT_CLIENT_ID = previous.MICROSOFT_CLIENT_ID;
    }
    if (previous.MICROSOFT_CLIENT_SECRET) {
      process.env.MICROSOFT_CLIENT_SECRET = previous.MICROSOFT_CLIENT_SECRET;
    }
    if (previous.MICROSOFT_REDIRECT_URI) {
      process.env.MICROSOFT_REDIRECT_URI = previous.MICROSOFT_REDIRECT_URI;
    }
  });
});

describe("outreach greetings and claims", () => {
  it("uses the first name and configured greeting style", () => {
    expect(outreachGreeting({ channel: "linkedin", firstName: null })).toBe(
      outreachConfig.greetings.linkedinNeutral,
    );
    expect(outreachGreeting({ channel: "email", firstName: null })).toBe(
      outreachConfig.greetings.emailNeutral,
    );
    expect(outreachGreeting({ channel: "email", firstName: "Priya" })).toBe(
      `${outreachConfig.greetings.withNamePrefix}Priya${outreachConfig.greetings.withNameSuffix}`,
    );
    expect(outreachGreeting({ channel: "email", firstName: "Priya Shah" })).toBe(
      "Hi Priya,",
    );
    expect(outreachGreeting({ channel: "email", firstName: "Priya Shah" })).not.toMatch(
      /dear priya shah/i,
    );
    expect(outreachGreeting({ channel: "linkedin", firstName: "Priya" })).toBe(
      "Hi Priya,",
    );
  });

  it("adds a redirect only for unconfirmed or missing contacts", () => {
    expect(
      shouldIncludeRedirect({ hasContact: false, roleConfirmed: false }),
    ).toBe(true);
    expect(
      shouldIncludeRedirect({ hasContact: true, roleConfirmed: false }),
    ).toBe(true);
    expect(
      shouldIncludeRedirect({ hasContact: true, roleConfirmed: true }),
    ).toBe(false);
    expect(
      redirectLineErrors({
        text: "If you're not the right person, I'd appreciate a pointer to who is.",
        includeRedirect: true,
      }),
    ).toEqual([]);
    expect(
      redirectLineErrors({
        text: "Would you have fifteen minutes this week?",
        includeRedirect: true,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      redirectLineErrors({
        text: "If you're not the right person, I'd appreciate a pointer to who is.",
        includeRedirect: false,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("rejects an em dash in a subject", async () => {
    const { validateOutreachContent } = await import(
      "@/lib/application-assets/outreach"
    );
    const errors = await validateOutreachContent({
      content: {
        type: "EMAIL",
        subject: "Senior Product Engineer — production reliability",
        greeting: "Hello,",
        paragraphs: [
          {
            id: "p1",
            text: "I applied through the employer portal.",
            supports: [],
          },
        ],
        signoff: "Thanks",
        signerName: "Alex Chen",
      },
      context: {
        sources: [],
        campaign: { applicationGuidance: null, appliedAt: null },
      } as never,
      greeting: "Hello,",
      signerName: "Alex Chen",
      confirmedHiringManagerRole: false,
      purpose: "PROACTIVE",
      includeRedirect: false,
    });
    expect(errors.some((error) => error.includes("—") || error.toLowerCase().includes("banned"))).toBe(
      true,
    );
  });

  it("rejects a double ask, a double redirect, and a missing final period", () => {
    expect(
      askAndRedirectCountErrors(
        "Would you have fifteen minutes this week? Are you open to a call next Tuesday?",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      askAndRedirectCountErrors(
        "If you're not the right person, I'd appreciate a pointer to who is. If you are not the right person, point me to the right person.",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      finalSentencePunctuationErrors(
        "I applied through the employer portal. Would you have time to talk",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      finalSentencePunctuationErrors(
        "I applied through the employer portal. Would you have time to talk?",
      ),
    ).toEqual([]);
  });

  it("rejects an unsupported fact about the recipient's team", () => {
    expect(
      unsupportedRecipientFactErrors({
        text: "The motion-planning work would be felt by the robotics team every week.",
        factTexts: [
          "Build the motion-planning service",
          "Review designs with the robotics team",
        ],
      }).length,
    ).toBeGreaterThan(0);
    expect(
      unsupportedRecipientFactErrors({
        text: "My understanding is that the role reviews designs with the robotics team.",
        factTexts: ["Review designs with the robotics team"],
      }),
    ).toEqual([]);
  });

  it("asks up to two questions when thank-you notes are thin", () => {
    expect(
      notesDescribeConversation(
        "The hiring manager will focus on incident leadership.",
      ),
    ).toBe(false);
    expect(
      notesDescribeConversation(
        "We discussed incident leadership. Priya asked how I handle on-call.",
      ),
    ).toBe(true);
    expect(interviewConfig.thankYouClarifyingQuestionLimit).toBe(2);
  });

  it("rejects messages that mention applying after Interviewing", () => {
    expect(
      appliedMentionErrors({
        text: "I’ve also submitted my application through the employer portal.",
        mentionApplied: false,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      appliedMentionErrors({
        text: "Thank you for the conversation about incident leadership.",
        mentionApplied: false,
      }),
    ).toEqual([]);
  });

  it("rejects generic thank-you subjects", () => {
    expect(
      thankYouSubjectErrors({
        subject: "Thank you for the update",
        notes: "We discussed incident leadership and on-call ownership.",
      }).length,
    ).toBeGreaterThan(0);
    expect(
      thankYouSubjectErrors({
        subject: "Incident leadership follow-through",
        notes: "We discussed incident leadership and on-call ownership.",
      }),
    ).toEqual([]);
    expect(
      conversationThankErrors({
        text: "Thank you for the update about incident leadership.",
        purpose: "THANK_YOU",
      }).length,
    ).toBeGreaterThan(0);
    expect(
      conversationThankErrors({
        text: "Thank you for the conversation about incident leadership.",
        purpose: "THANK_YOU",
      }),
    ).toEqual([]);
  });

  it("treats an answered thank-you clarifying question as seeker FACT that passes validation", async () => {
    const answers = [
      {
        id: "q-on-call",
        answer:
          "We discussed my on-call rotation and the invoice rewrite I led that cut failed billing runs.",
      },
    ];
    const sources = thankYouAnswerSources({
      interviewStageId: "stage-thank-you",
      answers,
    });
    expect(sources).toEqual([
      {
        id: "interview:stage-thank-you:thankYouAnswer:q-on-call",
        text: answers[0]!.answer,
        category: "PROFILE_FACT",
        url: null,
      },
    ]);

    const messages = buildOutreachAssetMessages({
      context: {
        sources,
        campaign: {
          id: "c1",
          name: "App",
          ownerUserId: "u1",
          applicationGuidance: null,
          appliedAt: null,
        },
      } as never,
      type: "EMAIL",
      greeting: "Hello,",
      signerName: "Alex Chen",
      confirmedHiringManagerRole: false,
      includeRedirect: false,
      purpose: "THANK_YOU",
      emailLength: "MEDIUM",
      priorMessage: null,
      interviewStageNotes: answers[0]!.answer,
      mentionApplied: false,
      regenerationInstruction: null,
      qualityFeedback: [],
    });
    const payload = JSON.parse(messages[1]!.content) as {
      citableSources: Array<{ id: string; text: string }>;
    };
    expect(payload.citableSources).toEqual([
      {
        id: sources[0]!.id,
        category: "PROFILE_FACT",
        text: answers[0]!.answer,
      },
    ]);

    const thankYou = {
      type: "EMAIL" as const,
      subject: "On-call rotation and invoice rewrite",
      greeting: "Hello,",
      paragraphs: [
        {
          id: "p1",
          text: "Thank you for the conversation about my on-call rotation and the invoice rewrite I led. Would a brief follow-up be useful?",
          supports: [
            {
              sourceId: sources[0]!.id,
              quote: "on-call rotation and the invoice rewrite I led",
            },
          ],
        },
      ],
      signoff: "Thanks",
      signerName: "Alex Chen",
    };
    expect(
      outreachSupportErrors(thankYou, {
        sources,
        campaign: { applicationGuidance: null, appliedAt: null },
      } as never),
    ).toEqual([]);

    const { validateOutreachContent } = await import(
      "@/lib/application-assets/outreach"
    );
    const errors = await validateOutreachContent({
      content: { ...thankYou, paragraphs: [{ ...thankYou.paragraphs[0]!, supports: [] }] },
      context: {
        sources,
        campaign: { applicationGuidance: null, appliedAt: null },
      } as never,
      greeting: "Hello,",
      signerName: "Alex Chen",
      confirmedHiringManagerRole: false,
      purpose: "THANK_YOU",
      includeRedirect: false,
      stageNotes: answers[0]!.answer,
      mentionApplied: false,
    });
    expect(errors).toEqual([]);
    expect(thankYou.paragraphs[0]!.text).toContain("on-call rotation");
    expect(thankYou.paragraphs[0]!.text).toContain("invoice rewrite");
  });

  it("requires thank-you messages to cite notes and never use a redirect", () => {
    expect(
      thankYouNotesErrors({
        text: "Thank you for your time. I enjoyed our conversation.",
        notes: "The hiring manager will focus on incident leadership.",
      }).length,
    ).toBeGreaterThan(0);
    expect(
      thankYouNotesErrors({
        text: "I appreciated your note that the hiring manager will focus on incident leadership. Would a brief follow-up be useful?",
        notes: "The hiring manager will focus on incident leadership.",
      }),
    ).toEqual([]);
    expect(
      redirectLineErrors({
        text: "If you're not the right person, I'd appreciate a pointer to who is.",
        includeRedirect: false,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("rejects generic relevance statements", () => {
    expect(
      genericRelevanceErrors(
        "Given the role's collaboration with the team, I wanted to introduce myself.",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      genericRelevanceErrors(
        "This hire changes how you review motion-planning designs each week.",
      ),
    ).toEqual([]);
  });

  it("flags a follow-up that repeats a thread sentence or is not shorter", () => {
    const original =
      "I led the rewrite of invoice generation that cut failed billing runs from 8% to under 1%. Would you have time to talk?";
    const repeated =
      "I led the rewrite of invoice generation that cut failed billing runs from 8% to under 1%. Checking in.";
    expect(
      threadRepetitionErrors({
        current: repeated,
        priorBodies: [original],
      }).length,
    ).toBeGreaterThan(0);
    expect(
      followUpLengthErrors({
        current: `${original} Checking in again this week.`,
        original,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      followUpLengthErrors({
        current: "Checking in on my earlier note. Any next step?",
        original,
      }),
    ).toEqual([]);
    expect(
      threadRepetitionErrors({
        current: "Checking in on my earlier note. Any next step?",
        priorBodies: [original],
      }),
    ).toEqual([]);
    expect(
      threadRepetitionErrors({
        current:
          "Hi Priya,\n\nFollowing up on my earlier note with one additional detail from my production work.\nI owned on-call for the payments service, one week in four.\nWould a brief conversation make sense?\n\nBest,\nAlex Chen",
        priorBodies: [
          "Hi Priya,\n\nI applied through the employer portal on 2026-09-20.\nI led the rewrite of invoice generation that cut failed billing runs from 8% to under 1%.\nWould you be open to a brief conversation?\n\nBest,\nAlex Chen",
        ],
      }),
    ).toEqual([]);
  });

  it("rejects hiring-manager claims unless the role is confirmed", () => {
    const claimed = hiringManagerClaimErrors({
      text: "As the hiring manager, you will decide.",
      confirmedHiringManagerRole: false,
      channel: "email",
    });
    expect(claimed.length).toBeGreaterThan(0);
    expect(
      hiringManagerClaimErrors({
        text: "As the hiring manager, you will decide.",
        confirmedHiringManagerRole: true,
        channel: "email",
      }),
    ).toEqual([]);
    expect(
      hiringManagerClaimErrors({
        text: "Dear Hiring Manager, I wanted to connect.",
        confirmedHiringManagerRole: false,
        channel: "linkedin",
      }).some((error) => error.toLowerCase().includes("dear hiring manager")),
    ).toBe(true);
  });

  it("flags connection notes over 300 characters instead of truncating", () => {
    const body = "x".repeat(301);
    const content: LinkedinNoteAssetContent = {
      type: "LINKEDIN_CONNECTION_NOTE",
      greeting: "Hi there,",
      body: {
        id: "note-1",
        text: body,
        supports: [{ sourceId: "profile:id_name", quote: "Alex" }],
      },
    };
    const composed = composeOutreachText(content);
    expect(composed.body.length).toBeGreaterThan(
      outreachConfig.linkedinLimits.connectionNoteChars,
    );
    const errors = outreachLimitErrors(content);
    expect(errors.some((error) => error.includes("Do not truncate"))).toBe(true);
  });

  it("budgets connection-note body characters after the greeting and space", () => {
    const greeting = outreachConfig.greetings.linkedinNeutral;
    expect(connectionNoteBodyBudget(greeting)).toBe(
      outreachConfig.linkedinLimits.connectionNoteChars - `${greeting} `.length,
    );
    expect(connectionNoteBodyBudget(greeting)).toBeLessThan(
      outreachConfig.linkedinLimits.connectionNoteChars,
    );
  });

  it("tells the model the remaining body budget and citable source ids", () => {
    const greeting = outreachConfig.greetings.linkedinNeutral;
    const messages = buildOutreachAssetMessages({
      context: {
        sources: [
          {
            id: "profile:ach_1",
            text: "Led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
            category: "PROFILE_FACT",
            url: null,
          },
        ],
        campaign: {
          id: "c1",
          name: "App",
          ownerUserId: "u1",
          applicationGuidance: null,
          appliedAt: null,
        },
      } as never,
      type: "LINKEDIN_CONNECTION_NOTE",
      greeting,
      signerName: "Alex Chen",
      confirmedHiringManagerRole: false,
      includeRedirect: true,
      purpose: "PROACTIVE",
      emailLength: null,
      priorMessage: null,
      interviewStageNotes: null,
      mentionApplied: true,
      regenerationInstruction: null,
      qualityFeedback: [],
    });
    const payload = JSON.parse(messages[1]!.content) as {
      citableSources: Array<{ id: string }>;
      characterLimits: { bodyMaxChars: number; connectionNote: number };
    };
    expect(payload.citableSources.map((source) => source.id)).toEqual([
      "profile:ach_1",
    ]);
    expect(payload.characterLimits.bodyMaxChars).toBe(
      connectionNoteBodyBudget(greeting),
    );
    expect(payload.characterLimits.connectionNote).toBe(300);
  });

  it("accepts an ask paragraph with no citations", async () => {
    const { validateOutreachContent } = await import(
      "@/lib/application-assets/outreach"
    );
    const errors = await validateOutreachContent({
      content: {
        type: "EMAIL",
        subject: "Follow-up",
        greeting: "Hello,",
        paragraphs: [
          {
            id: "ask",
            text: "If you are not the right person, a pointer to who is would help.",
            supports: [],
          },
        ],
        signoff: "Thanks",
        signerName: "Alex Chen",
      },
      context: {
        sources: [],
        campaign: { applicationGuidance: null, appliedAt: null },
      } as never,
      greeting: "Hello,",
      signerName: "Alex Chen",
      confirmedHiringManagerRole: false,
      purpose: "PROACTIVE",
      includeRedirect: true,
    });
    expect(errors).toEqual([]);
  });
});

describe("handoff links", () => {
  it("prefills To, subject, and body when an email is available", () => {
    const handoff = outreachEmailHandoff({
      to: "priya.shah@acmerobotics.example",
      subject: "Applied for Senior Product Engineer",
      body: "Hello,\n\nI applied this week.",
    });
    expect(handoff.outlookWeb.href).toContain("outlook.office.com");
    expect(handoff.outlookWeb.href).toContain(
      encodeURIComponent("priya.shah@acmerobotics.example"),
    );
    expect(handoff.outlookWeb.href).toContain(
      encodeURIComponent("Applied for Senior Product Engineer"),
    );
    expect(handoff.gmailWeb.href).toContain("mail.google.com");
    expect(handoff.gmailWeb.href).toContain("su=");
    expect(handoff.outlookDesktop.href).toContain("mailto:");
    expect(handoff.outlookDesktop.href).toContain("subject=");
    expect(handoff.outlookDesktop.href).toContain("body=");
    const section = readFileSync(
      "src/components/ApplicationOutreachSections.tsx",
      "utf8",
    );
    expect(section).toContain("downloadResume");
    expect(section).toContain("/api/application-assets/");
  });
});

describe("application reminder cadence", () => {
  it("treats blank fields as no reminder, not zero", () => {
    expect(parseOptionalReminderDay("")).toBeNull();
    expect(parseOptionalReminderDay("   ")).toBeNull();
    expect(parseOptionalReminderDay(null)).toBeNull();
    expect(Number.isNaN(parseOptionalReminderDay("0"))).toBe(true);
    expect(
      validateApplicationReminderInput({
        reminderDay3: 3,
        reminderDay7: 7,
        reminderEmail4Days: null,
        reminderRepeatDays: null,
      }),
    ).toBeNull();
    expect(
      reminderDaysFromPolicy({
        reminderDay3: 3,
        reminderDay7: 7,
        reminderEmail4Days: null,
        reminderRepeatDays: null,
        interviewThankYouHours: interviewConfig.reminders.defaultThankYouHours,
        interviewCheckInBusinessDays:
          interviewConfig.reminders.defaultCheckInBusinessDays,
      }),
    ).toEqual([3, 7]);
    expect(
      reminderDaysFromPolicy({
        reminderDay3: null,
        reminderDay7: null,
        reminderEmail4Days: null,
        reminderRepeatDays: null,
        interviewThankYouHours: interviewConfig.reminders.defaultThankYouHours,
        interviewCheckInBusinessDays:
          interviewConfig.reminders.defaultCheckInBusinessDays,
      }),
    ).toEqual([]);
  });

  it("anchors to Applied, or the first sent outreach when not applied", () => {
    const applied = new Date("2026-09-01T12:00:00.000Z");
    const sent = new Date("2026-09-04T12:00:00.000Z");
    expect(
      applicationReminderAnchor({ appliedAt: applied, firstOutreachSentAt: sent }),
    ).toEqual(applied);
    expect(
      applicationReminderAnchor({ appliedAt: null, firstOutreachSentAt: sent }),
    ).toEqual(sent);
    const day3 = reminderDueAt(applied, 3);
    expect(
      isApplicationReminderDue({
        anchor: applied,
        day: 3,
        now: new Date("2026-09-04T12:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      isApplicationReminderDue({
        anchor: applied,
        day: 7,
        now: new Date("2026-09-04T12:00:00.000Z"),
      }),
    ).toBe(false);
    expect(day3.toISOString().startsWith("2026-09-04")).toBe(true);
  });

  it("shows channel names instead of outreach type enums", async () => {
    const { formatOutreachTypeLabel } = await import(
      "@/lib/application-assets/display"
    );
    expect(formatOutreachTypeLabel("LINKEDIN_CONNECTION_NOTE")).toBe(
      "LinkedIn connection note",
    );
    expect(formatOutreachTypeLabel("LINKEDIN_INMAIL")).toBe("LinkedIn InMail");
    expect(formatOutreachTypeLabel("EMAIL")).toBe("Email");
    const section = readFileSync(
      "src/components/ApplicationOutreachSections.tsx",
      "utf8",
    );
    expect(section).toContain("formatOutreachTypeLabel");
    expect(section).not.toContain("{asset.type} · v");
    expect(section).not.toContain("{asset.type} v");
  });

  it("keeps a failed outreach generate on screen instead of remounting the page", () => {
    const action = readFileSync(
      "src/app/actions/application-outreach.ts",
      "utf8",
    );
    const generateFn = action.slice(
      action.indexOf("export async function generateOutreachAssetAction"),
      action.indexOf("export async function markOutreachSentAction"),
    );
    expect(generateFn).toContain("enqueueApplicationJob");
    expect(generateFn).toContain("revalidate(id)");
  });

  it("never writes CampaignContact.nextDueAt from the reminder action", () => {
    const action = readFileSync("src/app/actions/cadence.ts", "utf8");
    const reminderFn = action.slice(
      action.indexOf("updateApplicationReminderPolicyAction"),
    );
    expect(reminderFn).toContain("updateApplicationReminderPolicyAction");
    expect(reminderFn).not.toContain("recomputeCampaignContactCadenceBatch");
    expect(reminderFn).not.toContain("nextDueAt");
  });
});

describe("title matching", () => {
  it("matches a recruiter title and accepts an override", () => {
    const roles = [
      {
        id: "hm",
        name: "Hiring Manager",
        suggestionKey: "hiring_manager",
        targetTitles: ["Director of Engineering", "Engineering Manager"],
      },
      {
        id: "rec",
        name: "Recruiter",
        suggestionKey: "recruiter",
        targetTitles: ["Recruiter", "Technical Recruiter", "Talent Acquisition"],
      },
    ];
    const matched = matchHiringTeamRoleFromTitle({
      title: "Technical Recruiter",
      roles,
    });
    expect(matched.personaId).toBe("rec");
    expect(matched.source).toBe("matched");
    const override = resolveContactPersonaDecision({
      overridePersonaId: "hm",
      matchedPersonaId: matched.personaId,
    });
    expect(override.personaId).toBe("hm");
    expect(override.source).toBe("override");
  });
});

const describeDb = hasTestDatabase() ? describe : describe.skip;

describeDb("application contacts and reminders", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  let recruiterRoleId = "";
  let hiringManagerRoleId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `outreach-${suffix}@example.test`,
      name: "Outreach Seeker",
    });
    organizationId = workspace.organization.id;
    userId = workspace.user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Profile ${suffix}`,
        approvalStatus: "APPROVED",
      },
    });
    const icp = await prisma.icp.create({
      data: { organizationId, productId: product.id, name: `ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Outreach ${suffix}`,
        productId: product.id,
        icpId: icp.id,
      },
    });
    campaignId = campaign.id;
    const recruiter = await prisma.persona.create({
      data: {
        organizationId,
        productId: product.id,
        campaignId,
        suggestionKey: "recruiter",
        name: "Recruiter",
        targetTitles: ["Recruiter", "Technical Recruiter"],
      },
    });
    const hiringManager = await prisma.persona.create({
      data: {
        organizationId,
        productId: product.id,
        campaignId,
        suggestionKey: "hiring_manager",
        name: "Hiring Manager",
        targetTitles: ["Director of Engineering"],
      },
    });
    recruiterRoleId = recruiter.id;
    hiringManagerRoleId = hiringManager.id;
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        rawText: "Senior Product Engineer\nAcme Robotics",
        title: "Senior Product Engineer",
        companyName: "Acme Robotics",
        scorecardJson: { mission: null, outcomes: [], competencies: [] },
      },
    });
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization
        .delete({ where: { id: organizationId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("adds a contact, matches Recruiter from title, and accepts an override", async () => {
    const added = await addApplicationContact({
      organizationId,
      campaignId,
      userId,
      firstName: "Priya",
      lastName: "Shah",
      title: "Technical Recruiter",
      email: `priya-${suffix}@acme.example`,
    });
    expect(added.personaId).toBe(recruiterRoleId);
    const titleMatched = await prisma.campaignContact.findFirst({
      where: { campaignId, contact: { lastName: "Shah" } },
    });
    expect(titleMatched?.roleConfirmed).toBe(false);
    await updateApplicationContactRole({
      organizationId,
      campaignId,
      userId,
      contactId: added.contactId,
      personaId: recruiterRoleId,
    });
    const confirmed = await prisma.campaignContact.findFirst({
      where: { campaignId, contact: { lastName: "Shah" } },
    });
    expect(confirmed?.roleConfirmed).toBe(true);
    await addApplicationContact({
      organizationId,
      campaignId,
      userId,
      firstName: "Lee",
      lastName: "Nguyen",
      title: "Technical Recruiter",
      email: `lee-${suffix}@acme.example`,
      personaId: hiringManagerRoleId,
    });
    const overridden = await prisma.campaignContact.findFirst({
      where: { campaignId, contact: { lastName: "Nguyen" } },
    });
    expect(overridden?.chosenPersonaId).toBe(hiringManagerRoleId);
    expect(overridden?.roleConfirmed).toBe(true);
  });

  it("adds a recruiter named in a posting to the Recruiter role", async () => {
    const added = await ingestNamedJobContacts({
      organizationId,
      campaignId,
      companyName: "Acme Robotics",
      namedContacts: [
        {
          firstName: "Jordan",
          lastName: "Hale",
          title: "Technical Recruiter",
          email: `jordan-${suffix}@acme.example`,
          phone: "512-555-0100",
        },
      ],
    });
    expect(added).toBe(1);
    const row = await prisma.campaignContact.findFirst({
      where: { campaignId, contact: { lastName: "Hale" } },
      include: { chosenPersona: true, contact: true },
    });
    expect(row?.chosenPersona?.suggestionKey).toBe("recruiter");
    expect(row?.contact.email).toBe(`jordan-${suffix}@acme.example`);
    expect(row?.roleConfirmed).toBe(true);
  });

  it("does not write nextDueAt when marking applied or sent", async () => {
    const contact = await prisma.contact.create({
      data: {
        organizationId,
        ownerUserId: userId,
        firstName: "Sam",
        lastName: "Ortiz",
      },
    });
    const membership = await prisma.campaignContact.create({
      data: {
        organizationId,
        campaignId,
        contactId: contact.id,
        nextDueAt: null,
      },
    });
    const { markApplicationApplied, markOutreachSent } = await import(
      "@/lib/application-assets/outreach"
    );
    await markApplicationApplied({
      organizationId,
      campaignId,
      userId,
      appliedAt: new Date("2026-09-01T12:00:00.000Z"),
    });
    const asset = await prisma.applicationAsset.create({
      data: {
        organizationId,
        campaignId,
        type: "EMAIL",
        groupKey: `EMAIL:${recruiterRoleId}:none:PROACTIVE`,
        version: 1,
        contentJson: {
          type: "EMAIL",
          subject: "Hello",
          greeting: "Hello,",
          paragraphs: [
            {
              id: "p1",
              text: "I applied.",
              supports: [{ sourceId: "profile:id_name", quote: "Alex" }],
            },
          ],
          signoff: "Thanks",
          signerName: "Alex Chen",
        },
        claimTraceJson: [],
        promptVersion: "1",
      },
    });
    await markOutreachSent({
      organizationId,
      campaignId,
      userId,
      assetId: asset.id,
      sentAt: new Date("2026-09-02T12:00:00.000Z"),
    });
    const after = await prisma.campaignContact.findUnique({
      where: { id: membership.id },
    });
    expect(after?.nextDueAt).toBeNull();
  });
});
