import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AiValidationError } from "@/lib/ai/errors";
import { zodToOpenAiStrictJsonSchema } from "@/lib/ai/zod-json-schema";
import {
  OUTREACH_GENERATION_FAILURE_MESSAGE,
  outreachGenerationFailure,
} from "@/lib/application-assets/ai";
import {
  composeOutreachText,
  emailAssetContentSchema,
  linkedinInmailAssetContentSchema,
  linkedinNoteAssetContentSchema,
  outreachSeekerEditSchema,
} from "@/lib/application-assets/contract";

const support = [{ sourceId: "profile:name", quote: "Jordan" }];

const emailFromModel = {
  type: "EMAIL" as const,
  subject: "Introduction",
  greeting: "Hello Ashley,",
  paragraphs: [
    { id: "p1", text: "First paragraph.", supports: support },
    { id: "p2", text: "Second paragraph.", supports: support },
  ],
  signoff: "Thanks",
  signerName: "Alex Chen",
  seekerEdit: null,
};

describe("outreach generate seekerEdit", () => {
  it("accepts the null edit strict output requires and keeps the generated message", () => {
    const email = emailAssetContentSchema.parse(emailFromModel);
    expect(email.seekerEdit).toBeUndefined();
    expect(email).not.toHaveProperty("seekerEdit");
    expect(composeOutreachText(email)).toMatchObject({
      subject: "Introduction",
      body: expect.stringContaining("First paragraph."),
    });
    expect(composeOutreachText(email).body).toContain("Second paragraph.");

    const omitted = emailAssetContentSchema.parse({
      ...emailFromModel,
      seekerEdit: undefined,
    });
    expect(omitted.seekerEdit).toBeUndefined();

    const edited = emailAssetContentSchema.parse({
      ...emailFromModel,
      seekerEdit: { subject: "Edited subject", body: "Edited body" },
    });
    expect(composeOutreachText(edited)).toEqual({
      subject: "Edited subject",
      body: "Edited body",
    });

    const wrongType = emailAssetContentSchema.safeParse({
      ...emailFromModel,
      seekerEdit: "none",
    });
    expect(wrongType.success).toBe(false);

    const note = linkedinNoteAssetContentSchema.parse({
      type: "LINKEDIN_CONNECTION_NOTE",
      greeting: "Hello Ashley,",
      body: { id: "b1", text: "Note body.", supports: support },
      seekerEdit: null,
    });
    expect(composeOutreachText(note).body).toBe("Hello Ashley, Note body.");

    const inmail = linkedinInmailAssetContentSchema.parse({
      type: "LINKEDIN_INMAIL",
      subject: "Hello",
      greeting: "Hello Ashley,",
      paragraphs: [{ id: "p1", text: "InMail body.", supports: support }],
      seekerEdit: null,
    });
    expect(composeOutreachText(inmail)).toMatchObject({
      subject: "Hello",
      body: expect.stringContaining("InMail body."),
    });
  });

  it("does not change the strict schema sent to the model", () => {
    for (const schema of [
      emailAssetContentSchema,
      linkedinNoteAssetContentSchema,
      linkedinInmailAssetContentSchema,
    ]) {
      const asOptional = zodToOpenAiStrictJsonSchema(
        schema.extend({ seekerEdit: outreachSeekerEditSchema.optional() }),
      );
      const asNullish = zodToOpenAiStrictJsonSchema(
        schema.extend({
          seekerEdit: outreachSeekerEditSchema.nullable().optional(),
        }),
      );
      expect(zodToOpenAiStrictJsonSchema(schema)).toEqual(asOptional);
      expect(asOptional).toEqual(asNullish);
    }
  });

  it("shows one plain message and logs the schema issue", () => {
    const error = new AiValidationError("AI structured output failed validation", {
      issues: [{ path: "seekerEdit", code: "invalid_type", expected: "object" }],
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = outreachGenerationFailure(error);
    expect(result).toEqual({
      ok: false,
      message: OUTREACH_GENERATION_FAILURE_MESSAGE,
    });
    expect(result.message).toBe(
      "The message couldn't be generated. Please try again.",
    );
    expect(result.message).not.toContain("seekerEdit");
    expect(result.message).not.toContain("invalid_type");
    const logged = String(spy.mock.calls[0]?.[0]);
    expect(logged).toContain("seekerEdit");
    expect(logged).toContain("invalid_type");
    expect(logged).toContain("application_asset_ai_failed");
    spy.mockRestore();

    const body = readFileSync(
      "src/components/ApplicationOutreachBody.tsx",
      "utf8",
    );
    const sections = readFileSync(
      "src/components/ApplicationOutreachSections.tsx",
      "utf8",
    );
    const dashboard = readFileSync(
      "src/components/DashboardInPlaceStepPanels.tsx",
      "utf8",
    );
    const workspace = readFileSync(
      "src/components/ApplicationWorkspace.tsx",
      "utf8",
    );
    expect(dashboard).toContain("<ApplicationOutreachBody");
    expect(workspace).toContain("<ApplicationOutreachBody");
    expect(body.match(/<WorkspaceProgress\b/g)).toHaveLength(1);
    expect(body).toContain('type="OUTREACH"');
    expect(body).toContain("hideFailure={hideJobFailure}");
    expect(body).toContain("campaignId={campaignId}");
    expect(dashboard).toContain("hideJobFailure");
    expect(workspace).not.toContain("hideJobFailure");
    expect(sections.match(/<Status result=\{generateState\}/g)).toHaveLength(1);
    expect(sections).toContain(
      "<Status result={generateState} suppressJobFailure",
    );
  });
});
