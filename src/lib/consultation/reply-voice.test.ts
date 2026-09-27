import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("seeker reply storage", () => {
  it("does not strip or gate seeker replies in live code", () => {
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    const repair = readFileSync("src/lib/consultation/repair-existing.ts", "utf8");
    expect(service).not.toContain("seekerWrittenReply");
    expect(service).not.toContain("looksLikeCompanyMotivation");
    expect(service).not.toContain("looksLikeWorkStory");
    expect(repair).not.toContain("seekerWrittenReply");
    expect(repair).not.toContain("looksLikeCompanyMotivation");
    expect(repair).not.toContain("looksLikeWorkStory");
    expect(service).toContain("input.answer.trim()");
    expect(service).toContain("companyMotivation");
  });
});
