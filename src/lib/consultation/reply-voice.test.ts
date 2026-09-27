import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  looksLikeCompanyMotivation,
  looksLikeWorkStory,
  seekerReplyHasSystemVoice,
  seekerWrittenReply,
} from "@/lib/consultation/reply-voice";

const motivation =
  "They are a global company we compete with today. Winning culture and known to be an outstanding employer with forward-thinking leadership.";
const armStory =
  "I have built OpenText's ARM products by completely retool the GTM motion.";
const systemVoice =
  "He also reports building the business from under $2M to $6.8M.";

describe("seeker reply voice", () => {
  it("keeps only what the seeker wrote and treats why-this-company as motivation", () => {
    expect(seekerReplyHasSystemVoice(systemVoice)).toBe(true);
    expect(seekerWrittenReply(`${motivation} ${systemVoice}`)).toBe(motivation);
    expect(looksLikeCompanyMotivation(motivation)).toBe(true);
    expect(looksLikeWorkStory(armStory)).toBe(true);
    expect(looksLikeCompanyMotivation(armStory)).toBe(false);
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    expect(service).toContain("seekerWrittenReply(input.answer)");
    expect(service).toContain("looksLikeCompanyMotivation(text)");
    const extract = readFileSync(
      "src/lib/prompt-content/consultation.ts",
      "utf8",
    );
    expect(extract).toContain("full Personal Profile");
    expect(extract).toContain("incomplete:");
    expect(extract).toContain("evidence:");
    expect(extract).toContain("no_evidence:");
    expect(extract).toContain(
      "treat the answer as motivation for wanting the company, never as a work story",
    );
  });
});
