import { describe, expect, it } from "vitest";
import {
  contactIdFromPersonPrepTarget,
  personPrepTargetKey,
} from "@/lib/interview/person-prep";
import { PERSON_PREP_TARGET_PREFIX } from "@/lib/consultation/contract";
import { interviewConfig } from "@/lib/product-config";

describe("per-person Harper prep", () => {
  it("offers a focused target when a person is linked", () => {
    expect(personPrepTargetKey("contact_1")).toBe(
      `${PERSON_PREP_TARGET_PREFIX}contact_1`,
    );
    expect(contactIdFromPersonPrepTarget("person-prep:contact_1")).toBe("contact_1");
    expect(interviewConfig.labels.personPrepOffer).toMatch(/interviewer/i);
    expect(interviewConfig.labels.personPrepFallbackOpening).toMatch(/probe/i);
  });
});
