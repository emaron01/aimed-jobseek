import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import {
  buildEmailPrompt,
  emailPromptOptionsForContext,
  replyStrategy,
} from "@/lib/email-generation/prompt";
import {
  buildFollowUpEmailPrompt,
  buildReplyEmailPrompt,
  selectUnusedFollowUpSpecifics,
} from "@/lib/email-generation/prepare-email-generation";
import { TenantError } from "@/lib/tenant/errors";
import { seedContactOnList } from "@/test/contact-seed";

function contextFixture(
  overrides: Partial<EmailGenerationContext> = {},
): EmailGenerationContext {
  return {
    organizationId: "org_1",
    userId: "user_1",
    campaignContact: {
      id: "cc_1",
      campaignId: "campaign_1",
      contactId: "contact_1",
    },
    campaign: {
      id: "campaign_1",
      name: "CRO outreach",
      offerName: "Forecast audit",
      offerDescription: "A review of forecast process gaps",
      offerCta: "Reply with a time for a 20-minute review",
      offerNotes: null,
      offerValidationJson: null,
      offerValidationHash: null,
      emailLength: "MEDIUM",
      emailGuidance: "Emphasize the free trial",
    },
    emailLength: "MEDIUM",
    contact: {
      id: "contact_1",
      companyId: "company_1",
      firstName: "Alex",
      lastName: "Rivera",
      email: "alex@example.test",
      title: "Chief Revenue Officer",
      company: "Acme",
      industry: "Software",
      location: "New York",
    },
    product: {
      id: "product_1",
      name: "Forecast OS",
      description: "Forecasting software",
      valueProposition: "More reliable forecasts",
      evidence: ["Published product fact: configurable workflow."],
      problemsSolved: [],
      messaging: {
        primaryPositioning: ["A forecast operating system"],
        coreValueThemes: ["Consistency"],
        strongestDifferentiators: ["Rep-level evidence"],
        proofPoints: ["Auditable forecast changes"],
        supportedClaims: ["Improves forecast process visibility"],
        claimsNotToMake: ["Guaranteed revenue growth"],
        terminologyToUse: ["forecast confidence"],
        terminologyToAvoid: ["magic"],
      },
    },
    persona: {
      id: "persona_1",
      name: "CRO",
      painPoints: ["Forecast calls rely on anecdotes"],
      desiredOutcomes: ["A defensible commit"],
      messagingNotes: ["Avoid guaranteed forecast-accuracy claims."],
      messaging: {
        positioning: ["Make forecast changes explainable"],
        proofPoints: ["Evidence at opportunity level"],
        objections: ["Another system for reps"],
      },
      profile: {
        terminology: ["commit", "pipeline coverage"],
        organizationalPressures: ["Board scrutiny"],
        buyingRole: ["Economic buyer"],
        decisionInfluence: ["Final approval"],
      },
    },
    icp: {
      id: "icp_1",
      name: "Mid-market SaaS",
      definition: "B2B SaaS with a multi-rep sales team",
      description: null,
    },
    contactResearch: {
      id: "research_1",
      currentTitle: "Chief Revenue Officer",
      roleSummary: "Owns forecast accuracy",
      responsibilities: ["Revenue forecast"],
      ownershipAreas: ["Pipeline"],
      professionalSignals: ["New planning process"],
      negativeRoleSignals: [],
      confidence: "HIGH",
      researchedAt: new Date(),
    },
    companyResearch: null,
    companyResearchUpdatedAt: null,
    excludedCopySignals: {
      riskSignals: [],
      professionalSignals: [],
      negativeRoleSignals: [],
    },
    personaResolution: {
      source: "chosen",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: null,
      decisionReason: null,
    },
    voiceSamples: [
      {
        id: "voice_new",
        label: "Recent email",
        sampleText: "FIRST VOICE SAMPLE",
        createdAt: new Date(),
      },
      {
        id: "voice_old",
        label: "Older email",
        sampleText: "SECOND VOICE SAMPLE",
        createdAt: new Date(0),
      },
    ],
    sequence: [],
    ...overrides,
  };
}

function promptMessages(
  context: EmailGenerationContext = contextFixture(),
  guidance?: string | null,
) {
  return buildEmailPrompt(
    context,
    emailPromptOptionsForContext(context),
    guidance ?? null,
  );
}

describe("buildEmailPrompt", () => {
  it("builds one system and one user message in the required priority order", () => {
    const messages = promptMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");

    const prompt = messages[1].content;
    const offer = prompt.indexOf('"offer"');
    const regeneration = prompt.indexOf('"regenerationInstructions"');
    const instructions = prompt.indexOf('"additionalInstructions"');
    const structure = prompt.indexOf('"emailStructure"');
    const needs = prompt.indexOf('"personaNeeds"');
    const persona = prompt.indexOf('"personaMessaging"');
    const product = prompt.indexOf('"productMessaging"');
    const contact = prompt.indexOf('"contactContext"');
    const voice = prompt.indexOf('"voiceStyle"');
    const companyResearch = prompt.indexOf('"companyResearch":');
    expect(companyResearch).toBeGreaterThan(structure);
    expect(companyResearch).toBeLessThan(needs);
    expect(needs).toBeLessThan(contact);
    expect(contact).toBeLessThan(voice);
    expect([
      regeneration,
      offer,
      instructions,
      structure,
      companyResearch,
      needs,
      persona,
      contact,
      product,
      voice,
    ]).toEqual(
      [
        ...[
          regeneration,
          offer,
          instructions,
          structure,
          companyResearch,
          needs,
          persona,
          contact,
          product,
          voice,
        ],
      ].sort(
        (a, b) => a - b,
      ),
    );
    expect(prompt).toContain("FIRST VOICE SAMPLE");
    expect(prompt).not.toContain("SECOND VOICE SAMPLE");
    expect(prompt).toContain("Avoid guaranteed forecast-accuracy claims.");
    expect(messages[0].content).toMatch(/JSON only/i);
    expect(messages[0].content).toMatch(/No markdown/i);
  });

  it("places regeneration guidance above campaign guidance", () => {
    const messages = promptMessages(
      contextFixture(),
      "Make the hook more direct",
    );
    const prompt = messages[1].content;
    const regeneration = prompt.indexOf('"regenerationInstructions"');
    const campaignGuidance = prompt.indexOf('"additionalInstructions"');

    expect(regeneration).toBeLessThan(campaignGuidance);
    expect(prompt).toContain(
      "Per-contact regeneration instruction that overrides campaign guidance: Make the hook more direct",
    );
    expect(messages[0].content).toMatch(
      /Per-contact regeneration instructions.*override campaign guidance/i,
    );
  });

  it.each([
    [
      "SHORT",
      "Put the greeting on its own line, then one blank line, then exactly 1 content paragraph. Write 2-3 content sentences total with no paragraph breaks inside that content paragraph. Sentence 1 frames the executive or business problem from openingProblemFraming (no product name or capability yet). End with one clear, low-friction action for the reader. Target 40-60 words excluding the greeting.",
    ],
    [
      "MEDIUM",
      "Put the greeting on its own line, then one blank line, then exactly 2 short content paragraphs separated by one blank line. Content paragraph 1: executive or business problem from openingProblemFraming, 2 sentences max. Do not lead with product name or capability. Content paragraph 2: offer and a clear action for the reader, 2 sentences max. Target 80-100 words excluding the greeting.",
    ],
    [
      "LONG",
      "Put the greeting on its own line, then one blank line, then exactly 3 short content paragraphs separated by one blank line. Content paragraph 1: executive or business problem from openingProblemFraming only, 2 sentences max. Do not name the product or any capability here. Content paragraph 2: how the product solves it, 2-3 sentences max. Content paragraph 3: offer and a clear action for the reader, 2 sentences max. Target 120-150 words excluding the greeting.",
    ],
  ] as const)("uses the exact %s structure instruction", (emailLength, instruction) => {
    const base = contextFixture();
    const messages = promptMessages(
      contextFixture({
        campaign: {
          ...base.campaign,
          emailLength,
        },
        emailLength,
      }),
    );

    expect(messages[1].content).toContain(`"emailLength": "${emailLength}"`);
    expect(messages[1].content).toContain(instruction);
    expect(messages[1].content).not.toContain("requiredParagraphCount");
    expect(messages[1].content).toContain('"mode": "FIXED_THIN"');
    expect(messages[0].content).toMatch(
      /greeting on its own line, followed by exactly one blank line/i,
    );
  });

  it.each([
    ["SHORT", "exactly 1 content block", "2-3 content sentences", "45-65 words"],
    ["MEDIUM", "exactly 2 content blocks", "3-5 content sentences", "80-110 words"],
    ["LONG", "exactly 3 content blocks", "5-8 content sentences", "110-160 words"],
  ] as const)(
    "keeps flexible openings inside the selected %s length",
    (emailLength, blocks, sentences, words) => {
      const base = contextFixture();
      const context = contextFixture({
        campaign: { ...base.campaign, emailLength },
        emailLength,
        companyResearch: {
          companySummary: "Automotive retail software provider",
          whatTheySell: "Dealer operations software",
          customerTypes: ["multi-rooftop dealer groups"],
          primaryMarkets: ["US automotive retail"],
          businessModel: "B2B SaaS",
          companySizeContext: null,
          confidence: "MEDIUM",
        },
      });
      const messages = buildEmailPrompt(
        context,
        emailPromptOptionsForContext(context, [
          {
            text: "multi-rooftop dealer groups",
            sourceField: "customerTypes",
            whyItMatters:
              "Distributed stakeholders complicate forecast evidence.",
          },
        ]),
      );
      const system = messages[0].content;
      const user = messages[1].content;

      expect(user).toContain('"mode": "FLEXIBLE_RESEARCH"');
      expect(user).toContain('"mode": "MODEL_CHOOSES_FROM_SUPPORT"');
      expect(user).toContain(blocks);
      expect(user).toContain(sentences);
      expect(user).toContain(words);
      expect(user).toContain("operational consequence");
      expect(user).not.toMatch(/Use [123] (?:compact|content|very short)/);
      expect(system).toContain("selected emailStructure exactly");
      expect(system).toContain(
        "authoritative for content-block count, sentence count, and word range",
      );
      expect(system).toContain("must not name the product");
      expect(system).toContain("without support from requiredMotionSpecifics");
      expect(system).toContain("need not occupy a fixed sentence");
      expect(system).toContain(
        "Do not create dedicated product and CTA paragraphs by default",
      );
    },
  );

  it("uses a per-draft length override instead of the campaign default", () => {
    const base = contextFixture();
    const context = {
      ...base,
      campaign: { ...base.campaign, emailLength: "MEDIUM" as const },
      emailLength: "SHORT" as const,
    };
    const messages = promptMessages(context);
    expect(messages[1].content).toContain('"emailLength": "SHORT"');
    expect(messages[1].content).toContain("exactly 1 content paragraph");
  });

  it("places prefixed campaign guidance immediately after the offer", () => {
    const prompt = promptMessages()[1].content;
    const offer = prompt.indexOf('"offer"');
    const guidance = prompt.indexOf('"additionalInstructions"');
    const persona = prompt.indexOf('"personaNeeds"');

    expect(offer).toBeLessThan(guidance);
    expect(guidance).toBeLessThan(persona);
    expect(prompt).toContain(
      "Additional instructions that override defaults: Emphasize the free trial",
    );
  });

  it("uses the first voice sample as the structural reference", () => {
    const messages = promptMessages();
    const systemPrompt = messages[0].content;
    const userPrompt = messages[1].content;

    expect(systemPrompt).toMatch(/match its sentence length/i);
    expect(systemPrompt).toMatch(/paragraph pacing/i);
    expect(systemPrompt).toMatch(/closing style/i);
    expect(systemPrompt).toMatch(/influence flexible structure/i);
    expect(systemPrompt).toMatch(/do not use bullet points/i);
    expect(systemPrompt).toMatch(/No paragraph may exceed three sentences/i);
    expect(systemPrompt).toMatch(/Do not write run-on sentences/i);
    expect(systemPrompt).toMatch(/no more than one question/i);
    expect(systemPrompt).toMatch(/question is optional/i);
    expect(systemPrompt).toMatch(/actionable close is required/i);
    expect(systemPrompt).toMatch(/final sentence must give the reader/i);
    expect(systemPrompt).toMatch(/I can walk through it/i);
    expect(userPrompt).toContain('"closingRequirement"');
    expect(userPrompt).toContain(
      "Do not merely state what the sender could do",
    );
    expect(userPrompt).toContain(
      "I can walk through how this would fit into a 20-minute demo.",
    );
    expect(systemPrompt).toMatch(/do not include a sign-off/i);
    expect(systemPrompt).toMatch(/signature block of any kind/i);
    expect(systemPrompt).toMatch(/end the generated body immediately/i);
    expect(systemPrompt).not.toMatch(/email client appends the signature/i);
    expect(messages[0].content).toMatch(/never use an em dash/i);
    expect(messages[0].content).toMatch(/no exceptions/i);
    expect(messages[0].content).toContain(
      "Do NOT restate what the company does.",
    );
    expect(messages[0].content).toMatch(
      /infer their selling motion from customerTypes, businessModel, whatTheySell, and primaryMarkets/i,
    );
    expect(userPrompt).toContain(
      "WRITING SAMPLE TO MATCH FOR STYLE AND STRUCTURE:",
    );
    expect(userPrompt).toContain("FIRST VOICE SAMPLE");
    expect(userPrompt).not.toContain("SECOND VOICE SAMPLE");
  });

  it("keeps generation usable when optional messaging and research are empty", () => {
    const context = contextFixture({
      contactResearch: null,
      voiceSamples: [],
      product: {
        ...contextFixture().product,
        messaging: {
          primaryPositioning: [],
          coreValueThemes: [],
          strongestDifferentiators: [],
          proofPoints: [],
          supportedClaims: [],
          claimsNotToMake: [],
          terminologyToUse: [],
          terminologyToAvoid: [],
        },
      },
      persona: {
        ...contextFixture().persona,
        painPoints: [],
        desiredOutcomes: [],
        messaging: { positioning: [], proofPoints: [], objections: [] },
        profile: {
          terminology: [],
          organizationalPressures: [],
          buyingRole: [],
          decisionInfluence: [],
        },
      },
    });
    const messages = promptMessages(context);
    expect(messages[1].content).toContain('"freshRoleResearch": null');
    expect(messages[1].content).toContain('"companyResearch": null');
    expect(messages[1].content).toContain(
      '"companyResearchReasoningSketch": null',
    );
    expect(messages[1].content).toContain('"voiceStyle": null');
    expect(messages[1].content).toContain('"supportedClaims": []');
  });
});

describe("generated email output", () => {
  it("removes every em dash while preserving paragraph breaks", async () => {
    const { removeEmDashes } = await import(
      "@/lib/email-generation/service"
    );
    const output = removeEmDashes(
      "Forecast accuracy—without the marketing language.\n\nHi Alex — would this help?",
    );

    expect(output).toBe(
      "Forecast accuracy, without the marketing language.\n\nHi Alex, would this help?",
    );
    expect(output).not.toContain("—");
  });

  it("removes a trailing sign-off and signature block", async () => {
    const { sanitizeGeneratedEmailBody } = await import(
      "@/lib/email-generation/service"
    );
    const output = sanitizeGeneratedEmailBody(
      "Hi Alex,\n\nWould this be useful?\n\nBest,\n[Your Name]",
    );

    expect(output).toBe("Hi Alex,\n\nWould this be useful?");
    expect(output).not.toMatch(/Best,|\[Your Name\]/);
  });

  it.each([
    "Hi Alex,\nWould this be useful?",
    "Hi Alex, Would this be useful?",
  ])("enforces a blank line after the greeting", async (input) => {
    const { sanitizeGeneratedEmailBody } = await import(
      "@/lib/email-generation/service"
    );
    expect(sanitizeGeneratedEmailBody(input)).toBe(
      "Hi Alex,\n\nWould this be useful?",
    );
  });

  it("preserves blank paragraphs in transport and mailto encoding", async () => {
    const {
      buildEmailClientLaunch,
      buildMailtoHref,
      EMAIL_CLIENTS,
      toEmailTransportBody,
    } = await import(
      "@/lib/email-generation/email-body"
    );
    const body = "First paragraph.\n\nSecond paragraph?";
    const transportBody = toEmailTransportBody(body);
    expect(transportBody).toBe(
      "First paragraph.\r\n\r\nSecond paragraph?",
    );
    const href = buildMailtoHref({
      to: "alex@example.com",
      subject: "Paragraph test",
      body,
    });
    expect(href).toContain("%0D%0A%0D%0A");
    expect(new URL(href).searchParams.get("body")).toBe(transportBody);
    for (const client of EMAIL_CLIENTS) {
      const launch = buildEmailClientLaunch({
        client,
        to: "alex@example.com",
        subject: "Paragraph test",
        body,
        maxUrlLength: 10_000,
      });
      expect(launch.bodyHandling).toBe("PREFILLED");
      expect(launch.href).toContain("%0D%0A%0D%0A");
      expect(new URL(launch.href!).searchParams.get("body")).toBe(
        transportBody,
      );
    }
  });

  it("copies an over-limit body without truncating it", async () => {
    const { buildEmailClientLaunch } = await import(
      "@/lib/email-generation/email-body"
    );
    const body = `${"Long paragraph. ".repeat(200)}\n\nClosing paragraph?`;
    const launch = buildEmailClientLaunch({
      client: "OUTLOOK_DESKTOP",
      to: "alex@example.com",
      subject: "Long email",
      body,
      maxUrlLength: 1800,
    });
    expect(launch.bodyHandling).toBe("COPIED");
    expect(launch.href).not.toContain("body=");
    expect(launch.bodyToCopy).toBe(body);
    expect(launch.bodyToCopy?.endsWith("Closing paragraph?")).toBe(true);
  });

  it("appends plain signatures for text Graph sends and HTML only when provided", async () => {
    const {
      appendEmailSignature,
      buildMicrosoftGraphSendMailPayload,
      plainTextBodyToHtmlFragments,
    } = await import("@/lib/email-generation/email-body");
    const body = "First paragraph.\n\nWould this be useful?";
    const signature = "Alex Rivera\nhttps://example.com/meet";
    const withSig = appendEmailSignature(body, signature);
    expect(withSig).toBe(
      "First paragraph.\n\nWould this be useful?\n\nAlex Rivera\nhttps://example.com/meet",
    );
    expect(appendEmailSignature(withSig, signature)).toBe(withSig);

    const textPayload = buildMicrosoftGraphSendMailPayload({
      to: "alex@example.com",
      subject: "Hello",
      body,
      signatureText: signature,
    });
    expect(textPayload.saveToSentItems).toBe(true);
    expect(textPayload.message.body.contentType).toBe("Text");
    expect(textPayload.message.body.content).toContain("Alex Rivera");
    expect(textPayload.message).not.toHaveProperty("from");

    const htmlSig = "<p><strong>Alex Rivera</strong></p>";
    const htmlPayload = buildMicrosoftGraphSendMailPayload({
      to: "alex@example.com",
      subject: "Hello",
      body,
      signatureText: signature,
      signatureHtml: htmlSig,
    });
    expect(htmlPayload.message.body.contentType).toBe("HTML");
    expect(htmlPayload.message.body.content).toContain(
      plainTextBodyToHtmlFragments(body),
    );
    expect(htmlPayload.message.body.content).toContain(htmlSig);
    expect(htmlPayload.message.body.content).not.toContain("font-family:Calibri");
  });

  it("opens each handoff href exactly once (no noopener null-fallback double fire)", async () => {
    const { openEmailClientHref } = await import(
      "@/lib/email-generation/email-body"
    );
    const assign = vi.fn();
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const createElement = vi.fn(() => ({
      href: "",
      target: "",
      rel: "",
      referrerPolicy: "",
      click,
      remove,
    }));
    const open = vi.fn(() => null);
    vi.stubGlobal("window", {
      location: { assign },
      open,
    });
    vi.stubGlobal("document", {
      createElement,
      body: { appendChild },
    });

    openEmailClientHref("mailto:alex@example.com?subject=Hi&body=Hello");
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(
      "mailto:alex@example.com?subject=Hi&body=Hello",
    );
    expect(open).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();

    assign.mockClear();
    openEmailClientHref(
      "https://outlook.office.com/mail/deeplink/compose?to=a%40b.com",
    );
    expect(assign).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(createElement).toHaveBeenCalledWith("a");
    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);

    click.mockClear();
    remove.mockClear();
    appendChild.mockClear();
    createElement.mockClear();
    openEmailClientHref(
      "https://mail.google.com/mail/?view=cm&fs=1&to=a%40b.com",
    );
    expect(assign).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(createElement).toHaveBeenCalledWith("a");
    expect(click).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});

describe("sequence and claim guards", () => {
  const sentEmail = {
    id: "draft_1",
    sequenceNumber: 1,
    kind: "INITIAL" as const,
    subject: "Forecast visibility",
    body: "Hi Alex, forecast calls can hide unsupported commits.\n\nWould a quick audit help?",
    status: "SENT" as const,
    sentAt: new Date("2026-08-24T12:00:00.000Z"),
    replyClassification: null,
    prospectReplyText: null,
    referralSuggested: false,
    inReplyToDraftId: null,
  };

  it("puts Email 1 verbatim into the Email 2 prompt", async () => {
    const prepared = await buildFollowUpEmailPrompt(
      contextFixture({ sequence: [sentEmail] }),
      2,
    );
    expect(prepared.messages[1].content).toContain(sentEmail.subject);
    expect(prepared.messages[1].content).toContain(
      JSON.stringify(sentEmail.body).slice(1, -1),
    );
    expect(prepared.messages[0].content).toMatch(
      /different supported product feature/i,
    );
    expect(prepared.messages[0].content).toMatch(
      /selected emailStructure remains authoritative/i,
    );
    expect(prepared.messages[0].content).not.toMatch(
      /shorter than the prior email/i,
    );
    expect(prepared.messages[0].content).toMatch(
      /different supported opening approach/i,
    );
    expect(prepared.messages[0].content).toMatch(
      /do not paraphrase the same problem/i,
    );
  });

  it("prefers a selected company fact not used by prior sequence emails", () => {
    const specifics = [
      {
        text: "dealer groups",
        sourceField: "customerTypes",
        whyItMatters: "Complex buying groups",
      },
      {
        text: "OEM programs",
        sourceField: "primaryMarkets",
        whyItMatters: "Long approval paths",
      },
    ];
    expect(
      selectUnusedFollowUpSpecifics(specifics, [
        { body: "Dealer groups often create complex buying paths." },
      ]),
    ).toEqual([specifics[1]]);
    expect(
      selectUnusedFollowUpSpecifics([specifics[0]], [
        { body: "Dealer groups often create complex buying paths." },
      ]),
    ).toEqual([specifics[0]]);
  });

  it("does not expose Email 2 until Email 1 is marked sent", async () => {
    const { nextSequencePosition } = await import(
      "@/lib/email-generation/sequence"
    );
    expect(() =>
      nextSequencePosition(
        contextFixture({
          sequence: [
            { ...sentEmail, status: "DRAFT", sentAt: null },
          ],
        }),
      ),
    ).toThrow(/must be marked as sent/i);
    expect(
      nextSequencePosition(contextFixture({ sequence: [sentEmail] })),
    ).toBe(2);
  });

  it("rejects a reused opening line or closing ask", async () => {
    const { assertFollowUpNovelty } = await import(
      "@/lib/email-generation/service"
    );
    expect(() =>
      assertFollowUpNovelty(sentEmail.body, [sentEmail]),
    ).toThrow(/opening|ask/i);
    expect(() =>
      assertFollowUpNovelty(
        "A different proof point is that deal evidence stays visible.\n\nWorth comparing approaches?",
        [sentEmail],
      ),
    ).not.toThrow();
  });

  it("defines materially different strategies for all five reply classes", () => {
    const classifications = [
      "INTERESTED",
      "OBJECTION",
      "REFERRAL",
      "NOT_NOW",
      "NOT_INTERESTED",
    ] as const;
    const strategies = classifications.map(replyStrategy);
    expect(new Set(strategies).size).toBe(5);
    expect(replyStrategy("INTERESTED")).toMatch(/next step/i);
    expect(replyStrategy("OBJECTION")).toMatch(/objection/i);
    expect(replyStrategy("REFERRAL")).toMatch(/introduction|referred/i);
    expect(replyStrategy("NOT_NOW")).toMatch(/window to revisit/i);
    expect(replyStrategy("NOT_INTERESTED")).toMatch(/stop selling/i);
  });

  it("keeps the deterministic guard limited to product-supplied restrictions", async () => {
    const { deterministicClaimViolations } = await import(
      "@/lib/email-generation/claim-validation"
    );
    const violations = deterministicClaimViolations({
      body: "We promise installation timelines.",
      claimsNotToMake: ["promise installation timelines"],
      terminologyToAvoid: [],
      repSources: {
        offerText: "",
        emailGuidance: null,
        regenerationGuidance: null,
      },
    });
    expect(
      violations.some((violation) => violation.type === "PROHIBITED_CLAIM"),
    ).toBe(true);
  });

  it("semantically flags unrelated physical-security offer claims", async () => {
    const { validateOfferSemantically } = await import(
      "@/lib/campaign/offer-validation"
    );
    const restrictions = [
      "no published incident-reduction figures",
      "do not promise installation timelines",
    ];
    const fixtures = [
      {
        offer: "We'll cut your incident rate or you don't pay.",
        matchedGuard: restrictions[0],
      },
      {
        offer: "Fully installed within 30 days, guaranteed.",
        matchedGuard: restrictions[1],
      },
    ];

    for (const fixture of fixtures) {
      const generateStructured = vi.fn(async (request) => {
        const serialized = JSON.stringify(request.messages);
        expect(serialized).toContain(fixture.offer);
        expect(serialized).toContain(fixture.matchedGuard);
        expect(request.messages[0].content).toMatch(
          /every factual assertion and commitment/i,
        );
        return {
          data: {
            conflicts: [
              {
                code: "CLAIM_CONFLICT" as const,
                message: `Offer conflicts with: ${fixture.matchedGuard}`,
                offerExcerpt: fixture.offer,
                evidenceExcerpt: fixture.matchedGuard,
              },
            ],
          },
          rawText: "{}",
          provider: "fixture",
          model: "semantic-fixture",
          modelUrlIdentifier: "semantic-fixture",
        };
      });
      const response = await validateOfferSemantically({
        ai: {
          generateStructured:
            generateStructured as unknown as import("@/lib/ai/types").AiProvider["generateStructured"],
        },
        offerText: fixture.offer,
        claimsNotToMake: restrictions,
        terminologyToAvoid: [],
        productEvidence: [
          "Published materials make no quantified safety-outcome claim.",
          "Deployment timing is determined after an on-site assessment.",
        ],
      });
      expect(response.data.conflicts).toHaveLength(1);
      expect(response.data.conflicts[0].evidenceExcerpt).toBe(
        fixture.matchedGuard,
      );
    }
  });

  it("compares sites, units, and hours without fixed term extractors", async () => {
    const { evidenceFragments, validateOfferSemantically } = await import(
      "@/lib/campaign/offer-validation"
    );
    const offer =
      "Coverage includes 20 sites, 300 sensor units, and 120 service hours.";
    const productEvidence = evidenceFragments(
      {
        standardPackage: {
          sites: 12,
          sensorUnits: 240,
          serviceHours: 80,
        },
      },
      "approvedProductEvidence",
    );
    const generateStructured = vi.fn(async (request) => {
      expect(JSON.stringify(request.messages)).toContain(offer);
      expect(JSON.stringify(request.messages)).toContain(
        "approvedProductEvidence.standardPackage.sites: 12",
      );
      return {
        data: {
          conflicts: ["20 sites", "300 sensor units", "120 service hours"].map(
            (offerExcerpt) => ({
              code: "EVIDENCE_CONFLICT" as const,
              message: `${offerExcerpt} contradicts the stated package scope.`,
              offerExcerpt,
              evidenceExcerpt: productEvidence.join("; "),
            }),
          ),
        },
        rawText: "{}",
        provider: "fixture",
        model: "semantic-fixture",
        modelUrlIdentifier: "semantic-fixture",
      };
    });
    const response = await validateOfferSemantically({
      ai: {
        generateStructured:
          generateStructured as unknown as import("@/lib/ai/types").AiProvider["generateStructured"],
      },
      offerText: offer,
      claimsNotToMake: [],
      terminologyToAvoid: [],
      productEvidence,
    });
    expect(response.data.conflicts.map((conflict) => conflict.offerExcerpt)).toEqual(
      ["20 sites", "300 sensor units", "120 service hours"],
    );
  });

  it("runs the same semantic guard on generated copy", async () => {
    const { validateGeneratedEmailClaims } = await import(
      "@/lib/email-generation/claim-validation"
    );
    const generateStructured = vi.fn(async (request) => {
      expect(JSON.stringify(request.messages)).toContain(
        "Fully installed within 30 days, guaranteed.",
      );
      return {
        data: {
          compliant: false,
          violations: [
            {
              type: "PROHIBITED_CLAIM" as const,
              description:
                "The generated copy promises a fixed installation timeline.",
              matchedGuard: "do not promise installation timelines",
              bodyExcerpt: "Fully installed within 30 days, guaranteed.",
            },
          ],
        },
        rawText: "{}",
        provider: "fixture",
        model: "semantic-fixture",
        modelUrlIdentifier: "semantic-fixture",
      };
    });
    const result = await validateGeneratedEmailClaims({
      ai: {
        generateStructured:
          generateStructured as unknown as import("@/lib/ai/types").AiProvider["generateStructured"],
      },
      context: contextFixture({
        campaign: {
          ...contextFixture().campaign,
          offerDescription: "Security system assessment",
        },
        product: {
          ...contextFixture().product,
          evidence: [
            "Deployment timing is determined after an on-site assessment.",
          ],
          messaging: {
            ...contextFixture().product.messaging,
            claimsNotToMake: ["do not promise installation timelines"],
          },
        },
      }),
      subject: "Physical security deployment",
      body: "Fully installed within 30 days, guaranteed.",
    });
    expect(generateStructured).toHaveBeenCalledOnce();
    expect(
      result.violations.some(
        (violation) =>
          violation.description ===
          "The generated copy promises a fixed installation timeline.",
      ),
    ).toBe(true);
  });

  it("flags an invented offer assertion without a campaign offer", async () => {
    const { validateGeneratedEmailClaims } = await import(
      "@/lib/email-generation/claim-validation"
    );
    const body = "The package includes 14 on-site inspection hours.";
    const generateStructured = vi.fn(async () => ({
      data: {
        compliant: false,
        violations: [
          {
            type: "INVENTED_OFFER_TERM" as const,
            description:
              "The generated package scope is absent from the campaign offer.",
            matchedGuard: null,
            bodyExcerpt: body,
          },
        ],
      },
      rawText: "{}",
      provider: "fixture",
      model: "semantic-fixture",
      modelUrlIdentifier: "semantic-fixture",
    }));
    const result = await validateGeneratedEmailClaims({
      ai: {
        generateStructured:
          generateStructured as unknown as import("@/lib/ai/types").AiProvider["generateStructured"],
      },
      context: contextFixture({
        campaign: {
          ...contextFixture().campaign,
          offerName: null,
          offerDescription: null,
          offerCta: null,
          offerNotes: null,
        },
      }),
      subject: "Inspection coverage",
      body,
    });
    expect(
      result.violations.some(
        (violation) => violation.type === "INVENTED_OFFER_TERM",
      ),
    ).toBe(true);
  });

  it("passes low-confidence company research into claim validation when fields are usable", async () => {
    const { validateGeneratedEmailClaims } = await import(
      "@/lib/email-generation/claim-validation"
    );
    const generateStructured = vi.fn(async (request) => {
      const userContent = String(request.messages[1]?.content ?? "");
      expect(userContent).toContain("companyResearch");
      expect(userContent).toContain("contactResearch");
      expect(userContent).toContain("multi-rooftop dealer groups");
      expect(userContent).toContain("Owns forecast process");
      expect(userContent).toMatch(/"tier":\s*"BEST"/);
      expect(request.messages[0].content).toMatch(/THIN/i);
      return {
        data: { compliant: true, violations: [] },
        rawText: "{}",
        provider: "fixture",
        model: "semantic-fixture",
        modelUrlIdentifier: "semantic-fixture",
      };
    });
    await validateGeneratedEmailClaims({
      ai: {
        generateStructured:
          generateStructured as unknown as import("@/lib/ai/types").AiProvider["generateStructured"],
      },
      context: contextFixture({
        companyResearch: {
          companySummary: "Automotive retail group",
          whatTheySell: "Vehicles and service products",
          customerTypes: ["multi-rooftop dealer groups"],
          primaryMarkets: ["US"],
          businessModel: "Franchise retail",
          companySizeContext: "Large",
          confidence: "LOW",
        },
        contactResearch: {
          id: "cr_1",
          currentTitle: "VP Sales",
          roleSummary: "Owns forecast process",
          responsibilities: ["Forecast ownership"],
          ownershipAreas: ["Revenue planning"],
          professionalSignals: [],
          negativeRoleSignals: [],
          confidence: "HIGH",
          researchedAt: new Date(),
        },
      }),
      subject: "Quick note",
      body: "Hi Alex, happy to share how peers in multi-rooftop dealer groups handle ownership of planning.",
    });
    expect(generateStructured).toHaveBeenCalledOnce();
  });

  it("keeps research-supported prospect facts silent after origin filtering", async () => {
    const { validateGeneratedEmailClaims } = await import(
      "@/lib/email-generation/claim-validation"
    );
    const body =
      "Teams selling to multi-rooftop dealer groups often struggle with forecast ownership.";
    const generateStructured = vi.fn(async () => ({
      data: {
        compliant: false,
        violations: [
          {
            type: "UNSUPPORTED_FACT" as const,
            description:
              "Claims the company sells to multi-rooftop dealer groups",
            matchedGuard: null,
            bodyExcerpt: "multi-rooftop dealer groups",
          },
        ],
      },
      rawText: "{}",
      provider: "fixture",
      model: "semantic-fixture",
      modelUrlIdentifier: "semantic-fixture",
    }));
    const result = await validateGeneratedEmailClaims({
      ai: {
        generateStructured:
          generateStructured as unknown as import("@/lib/ai/types").AiProvider["generateStructured"],
      },
      context: contextFixture({
        companyResearch: {
          companySummary: null,
          whatTheySell: null,
          customerTypes: ["multi-rooftop dealer groups"],
          primaryMarkets: [],
          businessModel: null,
          companySizeContext: null,
          confidence: "HIGH",
        },
      }),
      subject: "Note",
      body,
    });
    expect(result.violations).toEqual([]);
  });

  it("does not flag emailGuidance website-visitor knowledge used in the draft", async () => {
    const { validateGeneratedEmailClaims } = await import(
      "@/lib/email-generation/claim-validation"
    );
    const guidance = "These are prospects that visited my website.";
    const body =
      "Hi Alex, since you visited my website I wanted to share a short note.";
    const generateStructured = vi.fn(async () => ({
      data: {
        compliant: false,
        violations: [
          {
            type: "UNSUPPORTED_FACT" as const,
            description:
              "Claims the prospect visited the website without research support",
            matchedGuard: "visited my website",
            bodyExcerpt: "visited my website",
          },
        ],
      },
      rawText: "{}",
      provider: "fixture",
      model: "semantic-fixture",
      modelUrlIdentifier: "semantic-fixture",
    }));
    const result = await validateGeneratedEmailClaims({
      ai: {
        generateStructured:
          generateStructured as unknown as import("@/lib/ai/types").AiProvider["generateStructured"],
      },
      context: contextFixture({
        campaign: {
          ...contextFixture().campaign,
          emailGuidance: guidance,
        },
        companyResearch: null,
        contactResearch: null,
      }),
      subject: "Following up",
      body,
    });
    expect(result.violations).toEqual([]);
  });

  it("contains no fitted product vocabulary or fixed evidence extractors", () => {
    const offerValidator = readFileSync(
      "src/lib/campaign/offer-validation.ts",
      "utf8",
    );
    const draftValidator = readFileSync(
      "src/lib/email-generation/claim-validation.ts",
      "utf8",
    );
    const prompt = readFileSync("src/lib/email-generation/prompt.ts", "utf8");
    const companyResearchUse = readFileSync(
      "src/lib/email-generation/company-research-use.ts",
      "utf8",
    );
    const motionSpecifics = readFileSync(
      "src/lib/email-generation/motion-specifics.ts",
      "utf8",
    );
    for (const source of [
      offerValidator,
      draftValidator,
      prompt,
      companyResearchUse,
      motionSpecifics,
    ]) {
      expect(source).not.toMatch(
        /forecast|accuracy|trial|roi|durationTerms|pricingTerms|audienceCountTerms|offerSensitiveTerms|dealership|F&I|ForecastWorks|StoneEagle|\bCRM\b|\bpipeline\b/i,
      );
    }
  });
});

describe("email generation action and UI seams", () => {
  it("rejects regeneration guidance over 200 characters before generation", async () => {
    const { generateEmailDraftAction } = await import("@/app/actions/email");
    const result = await generateEmailDraftAction(
      "campaign_contact_1",
      "x".repeat(201),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/200 characters or fewer/i);
  });

  it("returns a typed result and renders the generated draft inline", () => {
    const action = readFileSync("src/app/actions/email.ts", "utf8");
    const form = readFileSync(
      "src/components/EmailSequenceWorkspace.tsx",
      "utf8",
    );
    const campaignDetailPage = readFileSync(
      "src/app/(app)/campaigns/[id]/page.tsx",
      "utf8",
    );
    const promptExamples = readFileSync(
      "src/components/EmailGuidancePromptExamples.tsx",
      "utf8",
    );
    const campaignSettings = readFileSync(
      "src/components/CampaignEmailSettingsForm.tsx",
      "utf8",
    );
    const newCampaign = readFileSync(
      "src/components/NewCampaignForm.tsx",
      "utf8",
    );
    const scoreReport = readFileSync(
      "src/components/ScoreReportClient.tsx",
      "utf8",
    );

    expect(action).toMatch(
      /generateEmailDraftAction\([\s\S]*Promise<GenerateEmailDraftActionResult>/,
    );
    expect(action).toContain("loadEmailGenerationContext");
    expect(action).toContain("prepareEmailGenerationMessages");
    expect(action).toContain("generateEmailDraft");
    expect(action).toContain("requireVerifiedForAiSpend");
    expect(action).toContain("ADDITIONAL_GUIDANCE_MAX_CHARS");
    expect(form).toContain("Generate Email");
    expect(form.match(/\+ Add email to \{vocab\.sequence\.singular\}/g)).toHaveLength(2);
    expect(form.lastIndexOf("+ Add email to {vocab.sequence.singular}")).toBeLessThan(
      form.indexOf("Stop {vocab.sequence.singular}"),
    );
    expect(form).toContain("I sent this — mark as sent");
    expect(form).toContain("Did you send this email?");
    expect(form).toContain("deeplink-send-confirm");
    expect(form).toContain("awaitingSendConfirm");
    expect(form).toContain("setAwaitingSendConfirm(true)");
    expect(form).toContain("canDraftReply");
    expect(form).toContain("disabled={!canDraftReply || aiBusy}");
    expect(form).toContain("disabled={!canAdd || aiBusy}");
    expect(form).toContain('aria-modal="true"');
    expect(form).toContain("fixed inset-0");
    expect(form).not.toContain("absolute inset-0 z-20");
    expect(form).toContain("Not yet");
    expect(form).toContain("follow-ups are timed correctly");
    expect(form).toContain("formatDailySendAdvisory");
    expect(form).not.toContain("Daily send warning:");
    expect(form).toContain("not a delivery confirmation");
    expect(form).toContain("Draft reply");
    expect(form).toContain("Applies only when you regenerate this draft.");
    expect(form).toContain("What should change?");
    expect(form).toContain("EmailGuidancePromptExamples");
    expect(campaignSettings).toContain("EmailGuidancePromptExamples");
    expect(newCampaign).toContain("EmailGuidancePromptExamples");
    expect(scoreReport).toContain("EmailGuidancePromptExamples");
    expect(promptExamples).toContain("Focus on the feature");
    expect(promptExamples).toContain("Emphasize faster decisions");
    expect(promptExamples).toContain("Lead with the upcoming deadline");
    expect(promptExamples).toContain("Highlight the newest capability");
    expect(promptExamples).toContain("Leave out pricing");
    expect(promptExamples).toContain("Use a more direct tone");
    expect(form).toContain("cursor-pointer");
    expect(form).toContain("sequence-reply-guidance");
    expect(form).toContain(
      "When this {vocab.prospect.singular} replies, click the email they replied to",
    );
    expect(form).toContain("Regenerate");
    expect(form).toContain("maxLength={ADDITIONAL_GUIDANCE_MAX_CHARS}");
    expect(form).toContain("email-sequence-status");
    expect(form).not.toContain(
      "Make sure your signature is set in your Outlook or Gmail client",
    );
    expect(form).toContain("Open in");
    expect(form).toContain("selected.subject");
    expect(form).toContain('href="/settings/email"');
    expect(form).not.toMatch(
      /Add a signature[\s\S]*href="\/settings\/voice"/,
    );
    expect(form).toContain("selected.body");
    expect(form).toContain("Save draft");
    expect(form).toContain("persistInBackground");
    expect(form).toContain("afterHandoff");
    expect(form).toContain("draft-persist-failure");
    expect(form).toContain("Open in");
    expect(form).toContain(
      "Open in ${option.label} with the current on-screen copy.",
    );
    expect(form).not.toContain("disabled={pending || !contactEmail}");
    expect(form).toContain("disabled={handoffLocked || !contactEmail}");
    const sequence = readFileSync("src/lib/email-generation/sequence.ts", "utf8");
    expect(sequence).toContain("validateGeneratedEmailClaims");
    expect(sequence).toContain("computeRepEditDelta");
    expect(sequence).toContain("repEditText");
    expect(form).toContain("Outlook Web");
    expect(form).toContain("Outlook desktop");
    expect(form).toContain("Gmail");
    expect(form).toContain("buildEmailClientLaunch");
    expect(form).toContain("appendEmailSignature");
    expect(form).toContain("emailSignature");
    expect(form).toContain('window.open("about:blank", "_blank")');
    expect(form).toContain("openEmailClientHref");
    expect(form).toContain("recordEmailClientIntentAction");
    expect(form).not.toContain(
      'window.open(href, "_blank", "noopener,noreferrer")',
    );
    expect(form).toContain("onDraftOpenedForReview");
    expect(form).toContain("Opened");
    expect(form).toContain("Sent");
    expect(campaignDetailPage).toContain("handoffAt");
    expect(action).toContain("saveEmailDraftAction");
    expect(campaignDetailPage).toContain("EmailDraftsStage");
    const draftsStage = readFileSync("src/components/EmailDraftsStage.tsx", "utf8");
    expect(draftsStage).toContain("sortEmailDraftContactsForSendQueue");
    expect(draftsStage).toContain("!row.suppressed");
    expect(draftsStage).toContain('row.contactStatus !== "EXCLUDED"');
    expect(draftsStage).toContain("formatEmailDraftContactListLine");
    expect(draftsStage).toContain("lookaheadGenerateEmailDraftAction");
    expect(draftsStage).toContain("pickNextContactAfterSend");
    expect(draftsStage).toContain("onSendComplete");
    expect(draftsStage).toContain("campaign-queue-complete");
    expect(form).toContain("onSendComplete");
    expect(draftsStage).toContain("Prepared");
    expect(draftsStage).toContain("Ready to review");
    expect(draftsStage).not.toContain("1 draft");
    expect(action).toContain("parseEmailLength");
    expect(form).toContain("selectedLength");
    expect(form).toContain("regenerateEmailDraftAction");
    expect(action).not.toContain("acknowledgeEmailDraftClaimConflictsAction");
    expect(action).not.toContain("requiresClaimAcknowledgment");
    expect(form).toContain("Claim conflicts in this draft");
    expect(form).not.toContain("Acknowledge conflicts and allow send");
    expect(form).toContain("Offending copy:");
    expect(form).toContain("{vocab.product.Singular} restriction:");
    const service = readFileSync("src/lib/email-generation/service.ts", "utf8");
    expect(service).toContain("Always persist the draft");
    expect(service).toContain("claimConflictsJson");
    expect(service).not.toMatch(
      /if \(claimConflicts\.length > 0\) \{\s*throw/,
    );
  });
});

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)(
  "email generation context and persistence",
  { timeout: 60_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = Date.now().toString(36);
    const organizationIds: string[] = [];
    const userIds: string[] = [];
    let organizationId = "";
    let userAId = "";
    let userBId = "";
    let campaignId = "";
    let campaignContactId = "";
    let foreignCampaignContactId = "";
    let contactId = "";
    let contactListId = "";

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "source" FROM "EmailDraft" LIMIT 0`;
      } catch {
        console.warn(
          "Skipping email generation DB tests: apply pending Prisma migrations first.",
        );
        return;
      }

      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const primary = await createIndividualWorkspace({
        email: `email-gen-a-${suffix}@example.test`,
        name: "Generator A",
      });
      organizationId = primary.organization.id;
      userAId = primary.user.id;
      organizationIds.push(organizationId);
      userIds.push(userAId);

      await prisma.researchPolicy.update({
        where: { organizationId },
        data: { contactResearchEnabled: true },
      });

      const userB = await prisma.user.create({
        data: {
          email: `email-gen-b-${suffix}@example.test`,
          emailNormalized: `email-gen-b-${suffix}@example.test`,
          name: "Generator B",
          activeOrganizationId: organizationId,
        },
      });
      userBId = userB.id;
      userIds.push(userBId);
      await prisma.organizationMembership.create({
        data: {
          organizationId,
          userId: userBId,
          role: "MEMBER",
        },
      });

      const product = await prisma.product.create({
        data: {
          organizationId,
          name: "Forecast OS",
          description: "Forecasting software",
          messagingJson: {
            supportedClaims: ["Improves forecast visibility"],
            claimsNotToMake: ["Guaranteed growth"],
            terminologyToAvoid: ["magic"],
          },
        },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId,
          productId: product.id,
          name: "SaaS",
          definition: "B2B SaaS revenue teams",
        },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId,
          productId: product.id,
          name: "CRO",
          painPoints: "Unreliable commits",
          desiredOutcomes: "Defensible forecasts",
          messagingNotes: "Avoid guaranteed claims",
          personaMessagingJson: {
            positioning: ["Explain forecast movement"],
            proofPoints: ["Opportunity evidence"],
            objections: ["Rep adoption"],
          },
          profileJson: { terminology: ["commit"] },
        },
      });
      const list = await prisma.contactList.create({
        data: {
          organizationId,
          ownerUserId: userAId,
          name: "Email generation contacts",
          sourceType: "PASTE",
          totalContacts: 1,
        },
      });
      contactListId = list.id;
      const contact = await seedContactOnList(prisma, {
        organizationId,
        contactListId: list.id,
        firstName: "Alex",
        email: `alex-${suffix}@example.test`,
        title: "Chief Revenue Officer",
        company: "Acme",
      });
      contactId = contact.id;
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userAId,
          name: "CRO campaign",
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          offerName: "Forecast audit",
          offerCta: "Reply to book 20 minutes",
          emailLength: "LONG",
          emailGuidance: "Emphasize the free trial",
        },
      });
      campaignId = campaign.id;
      const campaignContact = await prisma.campaignContact.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          contactId: contact.id,
          status: "SELECTED",
          chosenPersonaId: persona.id,
        },
      });
      campaignContactId = campaignContact.id;

      await prisma.voiceSample.createMany({
        data: [
          {
            organizationId,
            userId: userAId,
            label: "Older",
            sampleText: "Older voice sample ".repeat(10),
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
          {
            organizationId,
            userId: userAId,
            label: "Newest",
            sampleText: "Newest voice sample ".repeat(10),
            createdAt: new Date("2026-08-01T00:00:00.000Z"),
          },
          {
            organizationId,
            userId: userBId,
            label: "Other user",
            sampleText: "This must never leak ".repeat(10),
          },
        ],
      });
      await prisma.contactResearch.create({
        data: {
          organizationId,
          contactId: contact.id,
          status: "COMPLETED",
          confidence: "HIGH",
          roleSummary: "Owns forecast accuracy",
          responsibilities: ["Revenue forecast"],
          researchedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const foreign = await createIndividualWorkspace({
        email: `email-gen-foreign-${suffix}@example.test`,
        name: "Foreign Generator",
      });
      organizationIds.push(foreign.organization.id);
      userIds.push(foreign.user.id);
      const foreignProduct = await prisma.product.create({
        data: {
          organizationId: foreign.organization.id,
          name: "Foreign product",
        },
      });
      const foreignIcp = await prisma.icp.create({
        data: {
          organizationId: foreign.organization.id,
          productId: foreignProduct.id,
          name: "Foreign ICP",
        },
      });
      const foreignPersona = await prisma.persona.create({
        data: {
          organizationId: foreign.organization.id,
          productId: foreignProduct.id,
          name: "Foreign persona",
        },
      });
      const foreignList = await prisma.contactList.create({
        data: {
          organizationId: foreign.organization.id,
          ownerUserId: foreign.user.id,
          name: "Foreign list",
          totalContacts: 1,
        },
      });
      const foreignContact = await seedContactOnList(prisma, {
        organizationId: foreign.organization.id,
        contactListId: foreignList.id,
        email: `foreign-${suffix}@example.test`,
      });
      const foreignCampaign = await prisma.campaign.create({
        data: {
          organizationId: foreign.organization.id,
          ownerUserId: foreign.user.id,
          name: "Foreign campaign",
          productId: foreignProduct.id,
          icpId: foreignIcp.id,
          personaId: foreignPersona.id,
        },
      });
      foreignCampaignContactId = (
        await prisma.campaignContact.create({
          data: {
            organizationId: foreign.organization.id,
            campaignId: foreignCampaign.id,
            contactId: foreignContact.id,
          },
        })
      ).id;
      ready = true;
    }, 60_000);

    afterAll(async () => {
      vi.unstubAllGlobals();
      for (const id of organizationIds) {
        await prisma.organization
          .delete({ where: { id } })
          .catch(() => undefined);
      }
      if (userIds.length > 0) {
        await prisma.user
          .deleteMany({ where: { id: { in: userIds } } })
          .catch(() => undefined);
      }
      if (prisma) await prisma.$disconnect();
    }, 60_000);

    it("loads direct messaging JSON, only the caller's voices, and fresh research", async () => {
      if (!ready) return;
      const { loadEmailGenerationContext } = await import(
        "@/lib/email-generation/context"
      );
      const context = await loadEmailGenerationContext(
        campaignContactId,
        userAId,
      );
      expect(context.product.messaging.supportedClaims).toEqual([
        "Improves forecast visibility",
      ]);
      expect(context.product.messaging.proofPoints).toEqual([]);
      expect(context.persona.messaging.positioning).toEqual([
        "Explain forecast movement",
      ]);
      expect(context.persona.profile.terminology).toEqual(["commit"]);
      expect(context.persona.messagingNotes).toEqual([
        "Avoid guaranteed claims",
      ]);
      expect(context.campaign.emailLength).toBe("LONG");
      expect(context.campaign.emailGuidance).toBe(
        "Emphasize the free trial",
      );
      expect(context.voiceSamples.map((sample) => sample.label)).toEqual([
        "Newest",
        "Older",
      ]);
      expect(context.contactResearch?.roleSummary).toBe(
        "Owns forecast accuracy",
      );
      expect(context.companyResearch).toBeNull();
      expect(context.product.problemsSolved).toEqual([]);
      expect(context.personaResolution.hasDecision).toBe(true);
      expect(context.personaResolution.source).toBe("chosen");
      expect(context.persona.name).toBe("CRO");
    });

    it("omits contact research from context when contact research is disabled for the org", async () => {
      if (!ready) return;
      await prisma.researchPolicy.update({
        where: { organizationId },
        data: { contactResearchEnabled: false },
      });
      const { loadEmailGenerationContext } = await import(
        "@/lib/email-generation/context"
      );
      const context = await loadEmailGenerationContext(
        campaignContactId,
        userAId,
      );
      expect(context.contactResearch).toBeNull();
      await prisma.researchPolicy.update({
        where: { organizationId },
        data: { contactResearchEnabled: true },
      });
    });

    it("refuses generation context when no persona decision exists", async () => {
      if (!ready) return;
      const undecidedContact = await seedContactOnList(prisma, {
        organizationId,
        contactListId,
        firstName: "Taylor",
        email: `taylor-${suffix}@example.test`,
        title: "VP of Sales",
      });
      const undecidedCampaignContact = await prisma.campaignContact.create({
        data: {
          organizationId,
          campaignId,
          contactId: undecidedContact.id,
          status: "SELECTED",
        },
      });
      const { loadEmailGenerationContext } = await import(
        "@/lib/email-generation/context"
      );
      await expect(
        loadEmailGenerationContext(undecidedCampaignContact.id, userAId),
      ).rejects.toThrow(/choose a persona/i);
    });

    it("uses ContactScore.matchedPersonaId instead of the campaign fallback when present", async () => {
      if (!ready) return;
      const campaign = await prisma.campaign.findUniqueOrThrow({
        where: { id: campaignId },
        select: { productId: true, icpId: true },
      });
      const matchedPersona = await prisma.persona.create({
        data: {
          organizationId,
          productId: campaign.productId,
          name: "RevOps",
          painPoints: "Rollup hygiene",
        },
      });
      const matchedContact = await seedContactOnList(prisma, {
        organizationId,
        contactListId,
        firstName: "Jordan",
        email: `jordan-${suffix}@example.test`,
        title: "Head of RevOps",
      });
      const matchedCampaignContact = await prisma.campaignContact.create({
        data: {
          organizationId,
          campaignId,
          contactId: matchedContact.id,
          status: "SELECTED",
        },
      });
      const run = await prisma.scoringRun.create({
        data: {
          organizationId,
          contactListId,
          productId: campaign.productId,
          icpId: campaign.icpId,
          personaId: null,
          status: "COMPLETED",
          productSnapshot: {},
          icpSnapshot: {},
          personaSnapshot: {},
          completedAt: new Date(),
        },
      });
      await prisma.contactScore.create({
        data: {
          organizationId,
          scoringRunId: run.id,
          contactId: matchedContact.id,
          scoringStatus: "COMPLETED",
          matchedPersonaId: matchedPersona.id,
          scoredAt: new Date(),
        },
      });
      const { loadEmailGenerationContext } = await import(
        "@/lib/email-generation/context"
      );
      const context = await loadEmailGenerationContext(
        matchedCampaignContact.id,
        userAId,
      );
      expect(context.persona.id).toBe(matchedPersona.id);
      expect(context.persona.name).toBe("RevOps");
      expect(context.personaResolution.hasDecision).toBe(true);
      expect(context.personaResolution.source).toBe("matched");
    });

    it("loads fresh company research and product problemsSolved for email use", async () => {
      if (!ready) return;
      const company = await prisma.company.create({
        data: {
          organizationId,
          name: "Acme Plants",
          normalizedName: `acme-plants-${suffix}`,
        },
      });
      await prisma.contact.update({
        where: { id: contactId },
        data: { companyId: company.id },
      });
      await prisma.companyResearch.create({
        data: {
          organizationId,
          companyId: company.id,
          status: "COMPLETED",
          researchConfidence: "HIGH",
          whatTheySell: "Industrial sensors for plant floors",
          customerTypes: ["plant managers"],
          primaryMarkets: ["US manufacturing"],
          businessModel: "Direct B2B equipment sales to multi-site plants",
          researchedAt: new Date(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.product.update({
        where: { id: (await prisma.campaign.findUniqueOrThrow({
          where: { id: campaignId },
          select: { productId: true },
        })).productId },
        data: {
          profileJson: {
            problemsSolved: ["Missed shift handoffs on the floor"],
          },
        },
      });

      const { loadEmailGenerationContext } = await import(
        "@/lib/email-generation/context"
      );
      const context = await loadEmailGenerationContext(
        campaignContactId,
        userAId,
      );
      expect(context.companyResearch?.whatTheySell).toBe(
        "Industrial sensors for plant floors",
      );
      expect(context.companyResearch?.customerTypes).toEqual([
        "plant managers",
      ]);
      expect(context.product.problemsSolved).toEqual([
        "Missed shift handoffs on the floor",
      ]);
    });

    it("withholds all company research when entity resolution is ambiguous", async () => {
      if (!ready) return;
      const contact = await prisma.contact.findUniqueOrThrow({
        where: { id: contactId },
        select: { companyId: true },
      });
      expect(contact.companyId).toBeTruthy();
      await prisma.companyResearch.updateMany({
        where: { organizationId, companyId: contact.companyId! },
        data: { identityAmbiguous: true },
      });

      const { loadEmailGenerationContext } = await import(
        "@/lib/email-generation/context"
      );
      const context = await loadEmailGenerationContext(
        campaignContactId,
        userAId,
      );
      expect(context.companyResearch).toBeNull();
      expect(context.companyResearchUpdatedAt).toBeNull();

      await prisma.companyResearch.updateMany({
        where: { organizationId, companyId: contact.companyId! },
        data: { identityAmbiguous: false },
      });
    });

    it("returns null for low-confidence or older-than-90-day research", async () => {
      if (!ready) return;
      const { loadEmailGenerationContext } = await import(
        "@/lib/email-generation/context"
      );
      await prisma.contactResearch.update({
        where: {
          organizationId_contactId: { organizationId, contactId },
        },
        data: {
          confidence: "LOW",
          researchedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      expect(
        (
          await loadEmailGenerationContext(campaignContactId, userAId)
        ).contactResearch,
      ).toBeNull();

      await prisma.contactResearch.update({
        where: {
          organizationId_contactId: { organizationId, contactId },
        },
        data: {
          confidence: "HIGH",
          researchedAt: new Date("2025-01-01T00:00:00.000Z"),
          expiresAt: new Date("2025-04-01T00:00:00.000Z"),
        },
      });
      const context = await loadEmailGenerationContext(
        campaignContactId,
        userAId,
      );
      expect(context.contactResearch).toBeNull();
    });

    it("rejects a CampaignContact owned by another organization", async () => {
      if (!ready) return;
      const { loadEmailGenerationContext } = await import(
        "@/lib/email-generation/context"
      );
      await expect(
        loadEmailGenerationContext(foreignCampaignContactId, userAId),
      ).rejects.toBeInstanceOf(TenantError);
    });

    it("calls gpt-5.6-luna and replaces the sequence-one draft on regeneration", async () => {
      if (!ready) return;
      const { clearAiProviderCache } = await import("@/lib/ai/provider");
      const { loadEmailGenerationContext } = await import(
        "@/lib/email-generation/context"
      );
      const { generateEmailDraft } = await import(
        "@/lib/email-generation/service"
      );

      process.env.EMAIL_AI_PROVIDER = "openai-responses";
      process.env.EMAIL_AI_MODEL = "gpt-5.6-luna";
      process.env.EMAIL_AI_MODEL_URL =
        "https://api.openai.com/v1/responses";
      process.env.EMAIL_AI_API_KEY = "email-test-secret";
      process.env.EMAIL_AI_MAX_RETRIES = "0";
      clearAiProviderCache();
      let generationCount = 0;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          const request = JSON.parse(String(init?.body ?? "{}"));
          expect(request.model).toBe("gpt-5.6-luna");
          expect(request.tools).toBeUndefined();
          expect(request.temperature).toBeUndefined();
          if (
            JSON.stringify(request).includes(
              "prospect_reply_classification",
            )
          ) {
            return new Response(
              JSON.stringify({
                output: [
                  {
                    type: "message",
                    content: [
                      {
                        type: "output_text",
                        text: JSON.stringify({
                          classification: "REFERRAL",
                          referralSuggested: true,
                          referralDetails: "Jane owns forecasting.",
                          reasoning: "The prospect directed the rep to Jane.",
                        }),
                      },
                    ],
                  },
                ],
                usage: { input_tokens: 4, output_tokens: 3 },
              }),
              { status: 200 },
            );
          }
          if (JSON.stringify(request).includes("email_claim_validation")) {
            return new Response(
              JSON.stringify({
                output: [
                  {
                    type: "message",
                    content: [
                      {
                        type: "output_text",
                        text: JSON.stringify({
                          compliant: true,
                          violations: [],
                        }),
                      },
                    ],
                  },
                ],
                usage: { input_tokens: 3, output_tokens: 2 },
              }),
              { status: 200 },
            );
          }
          generationCount += 1;
          if (JSON.stringify(request).includes("Make it shorter")) {
            expect(generationCount).toBeGreaterThanOrEqual(2);
          }
          const isShorterRegen = JSON.stringify(request).includes(
            "Make it shorter",
          );
          return new Response(
            JSON.stringify({
              output: [
                {
                  type: "message",
                  content: [
                    {
                      type: "output_text",
                      text: JSON.stringify({
                        subject: isShorterRegen
                          ? "A shorter forecast note"
                          : "A forecast—without the guesswork",
                        body: isShorterRegen
                          ? "Hi Alex, would a forecast audit help for US manufacturing teams?"
                          : "Hi Alex—quick question.\n\nAcross US manufacturing plants, forecast stages can hide missing buyer evidence.\n\nWould a forecast audit be useful?\n\nBest,\n[Your Name]",
                        reasoning: "Connects the offer to forecast ownership.",
                      }),
                    },
                  ],
                },
              ],
              usage: { input_tokens: 20, output_tokens: 12 },
            }),
            { status: 200 },
          );
        }),
      );

      const context = await loadEmailGenerationContext(
        campaignContactId,
        userAId,
      );
      const created = await generateEmailDraft(
        context,
        promptMessages(context),
      );
      expect(created.subject).toBe("A forecast, without the guesswork");
      expect(created.body).toBe(
        "Hi Alex, quick question.\n\nAcross US manufacturing plants, forecast stages can hide missing buyer evidence.\n\nWould a forecast audit be useful?",
      );
      expect(created.subject).not.toContain("—");
      expect(created.body).not.toContain("—");
      expect(created.regenerated).toBe(false);
      const persistedCreated = await prisma.emailDraft.findUniqueOrThrow({
        where: { id: created.draftId },
        select: { subject: true, body: true },
      });
      const { buildMailtoHref } = await import(
        "@/lib/email-generation/email-body"
      );
      const deeplink = buildMailtoHref({
        to: `alex-${suffix}@example.test`,
        subject: persistedCreated.subject ?? "",
        body: persistedCreated.body ?? "",
      });
      expect(deeplink).toContain("%0D%0A%0D%0A");
      expect(new URL(deeplink).searchParams.get("body")).toBe(
        "Hi Alex, quick question.\r\n\r\nAcross US manufacturing plants, forecast stages can hide missing buyer evidence.\r\n\r\nWould a forecast audit be useful?",
      );
      const { recordEmailClientIntent } = await import(
        "@/lib/email-generation/sequence"
      );
      const handoff = await recordEmailClientIntent({
        draftId: created.draftId,
        userId: userAId,
        client: "OUTLOOK_DESKTOP",
        bodyHandling: "PREFILLED",
      });
      expect(handoff.occurredAt).toBeInstanceOf(Date);
      const afterIntent = await prisma.emailDraft.findUniqueOrThrow({
        where: { id: created.draftId },
        select: { status: true, sentAt: true },
      });
      expect(afterIntent).toEqual({ status: "DRAFT", sentAt: null });
      expect(
        await prisma.usageEvent.count({
          where: {
            organizationId,
            userId: userAId,
            operation: "EMAIL_DEEPLINK_OPENED",
          },
        }),
      ).toBe(1);
      expect(
        await prisma.emailSendRecord.findFirstOrThrow({
          where: {
            organizationId,
            emailDraftId: created.draftId,
            method: "DEEPLINK_INTENT",
          },
          select: {
            recipient: true,
            subject: true,
            generatedBody: true,
            finalBody: true,
            sentByUserId: true,
            providerMessageId: true,
          },
        }),
      ).toEqual({
        recipient: `alex-${suffix}@example.test`,
        subject: "A forecast, without the guesswork",
        generatedBody:
          "Hi Alex, quick question.\n\nAcross US manufacturing plants, forecast stages can hide missing buyer evidence.\n\nWould a forecast audit be useful?",
        finalBody:
          "Hi Alex, quick question.\n\nAcross US manufacturing plants, forecast stages can hide missing buyer evidence.\n\nWould a forecast audit be useful?",
        sentByUserId: userAId,
        providerMessageId: null,
      });
      const { updateEmailDraftContent } = await import(
        "@/lib/email-generation/sequence"
      );
      await updateEmailDraftContent({
        draftId: created.draftId,
        userId: userAId,
        subject: created.subject,
        body: "First paragraph.\r\n\r\nSecond paragraph?",
      });
      expect(
        (
          await prisma.emailDraft.findUniqueOrThrow({
            where: { id: created.draftId },
            select: { body: true },
          })
        ).body,
      ).toBe("First paragraph.\n\nSecond paragraph?");

      const regenerated = await generateEmailDraft(
        context,
        promptMessages(context, "Make it shorter"),
      );
      expect(regenerated.regenerated).toBe(true);
      expect(regenerated.draftId).toBe(created.draftId);
      expect(regenerated.subject).toBe("A shorter forecast note");

      const drafts = await prisma.emailDraft.findMany({
        where: {
          organizationId,
          campaignContactId,
        },
      });
      expect(drafts).toHaveLength(1);
      const [draft] = drafts;
      expect(draft.status).toBe("DRAFT");
      expect(draft.source).toBe("AI");
      expect(draft.subject).toBe("A shorter forecast note");
      expect(draft.body).not.toContain("—");

      const event = await prisma.usageEvent.findFirstOrThrow({
        where: {
          organizationId,
          userId: userAId,
          operation: "EMAIL_DRAFT_CREATED",
        },
        orderBy: { createdAt: "desc" },
      });
      expect(event.category).toBe("EMAIL_GENERATION");
      expect(event.status).toBe("SUCCESS");
      expect(event.model).toBe("gpt-5.6-luna");
      expect(event.inputTokens).toBe(23);
      expect(JSON.stringify(event.metadata)).toContain('"regenerated":true');
      expect(JSON.stringify(event.metadata)).toContain('"personalizationTier"');
      expect(JSON.stringify(event.metadata)).toContain(
        '"companyResearchUsed"',
      );
      expect(JSON.stringify(event.metadata)).not.toContain(
        "Connects the offer",
      );

      await expect(
        generateEmailDraft(context, promptMessages(context), {
          sequenceNumber: 2,
          kind: "FOLLOW_UP",
        }),
      ).rejects.toThrow(/Email 1 must be marked as sent/i);

      const { markEmailDraftSent } = await import(
        "@/lib/email-generation/sequence"
      );
      await markEmailDraftSent({
        draftId: created.draftId,
        userId: userAId,
      });
      const sentContext = await loadEmailGenerationContext(
        campaignContactId,
        userAId,
      );
      expect(sentContext.sequence[0].status).toBe("SENT");
      expect(sentContext.sequence[0].sentAt).toBeInstanceOf(Date);
      await expect(
        generateEmailDraft(sentContext, promptMessages(sentContext)),
      ).rejects.toThrow(/read-only/i);

      const { classifyProspectReply } = await import(
        "@/lib/email-generation/reply"
      );
      const sourceDraft = sentContext.sequence[0];
      const prospectReply =
        "Jane owns forecasting now. Please speak with her instead.";
      const classification = await classifyProspectReply({
        context: sentContext,
        sourceDraft: {
          subject: sourceDraft.subject ?? "",
          body: sourceDraft.body ?? "",
        },
        prospectReply,
      });
      expect(classification.classification).toBe("REFERRAL");
      const contactCountBeforeReferral = await prisma.contact.count({
        where: { organizationId },
      });
      const replyPrepared = await buildReplyEmailPrompt({
        context: sentContext,
        sourceDraft: {
          sequenceNumber: sourceDraft.sequenceNumber,
          subject: sourceDraft.subject ?? "",
          body: sourceDraft.body ?? "",
        },
        prospectReply,
        classification: classification.classification,
      });
      const replyDraft = await generateEmailDraft(
        sentContext,
        replyPrepared.messages,
        {
          sequenceNumber: 2,
          kind: "REPLY",
          replyClassification: classification.classification,
          prospectReplyText: prospectReply,
          referralSuggested: classification.referralSuggested,
          inReplyToDraftId: sourceDraft.id,
          requiredMotionSpecifics: replyPrepared.requiredMotionSpecifics,
          personalization: replyPrepared.personalization,
          factSelectionUsage: replyPrepared.factSelection.usage,
          factSelectionCacheKey: replyPrepared.factSelection.cacheKey,
        },
      );
      expect(replyDraft.kind).toBe("REPLY");
      expect(replyDraft.replyClassification).toBe("REFERRAL");
      expect(replyDraft.referralSuggested).toBe(true);
      expect(
        await prisma.contact.count({ where: { organizationId } }),
      ).toBe(contactCountBeforeReferral);

      const secondContact = await seedContactOnList(prisma, {
        organizationId,
        contactListId: contactListId,
        firstName: "Second",
        lastName: "Contact",
        email: `second-${suffix}@example.com`,
      });
      const secondCampaignContact = await prisma.campaignContact.create({
        data: {
          organizationId,
          campaignId,
          contactId: secondContact.id,
          status: "SELECTED",
        },
      });
      await prisma.emailDraft.create({
        data: {
          organizationId,
          campaignContactId: secondCampaignContact.id,
          sequenceNumber: 1,
          subject: "Independent sequence",
          body: "Each campaign contact can begin at Email 1.",
          status: "DRAFT",
        },
      });
      expect(
        await prisma.emailDraft.count({
          where: { organizationId, sequenceNumber: 1 },
        }),
      ).toBe(2);
    });
  },
);
