import { describe, expect, it } from "vitest";
import {
  contactIdFromPersonPrepTarget,
  personPrepTargetKey,
} from "@/lib/interview/person-prep";
import { PERSON_PREP_TARGET_PREFIX } from "@/lib/consultation/contract";
import { interviewConfig } from "@/lib/product-config";
import { readFileSync } from "node:fs";

describe("per-person Harper prep", () => {
  it("offers a focused target when a person is linked", () => {
    expect(personPrepTargetKey("contact_1")).toBe(
      `${PERSON_PREP_TARGET_PREFIX}contact_1`,
    );
    expect(contactIdFromPersonPrepTarget("person-prep:contact_1")).toBe("contact_1");
    expect(interviewConfig.labels.personPrepOffer).toMatch(/interviewer/i);
    const source = readFileSync("src/lib/interview/person-prep.ts", "utf8");
    expect(source).not.toContain("prepares the seeker");
    expect(source).not.toContain("personPrepFallbackOpening");
    expect(source).toContain("interviewerPrep");
  });
});
