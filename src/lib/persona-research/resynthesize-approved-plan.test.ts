import { describe, expect, it } from "vitest";
import { vocab } from "@/lib/product-config";
import { TARGET_TITLES_FIELD } from "@/lib/persona/manual-target-titles";
import {
  buildPersonaResynthesisApplyPlan,
  personaTextSnapshot,
} from "@/lib/persona-research/resynthesize-approved-plan";

describe("buildPersonaResynthesisApplyPlan", () => {
  const persona = {
    id: "persona_cro",
    name: "Chief Revenue Officer",
    manuallyEditedFields: [TARGET_TITLES_FIELD],
    targetTitles: ["CRO", "Chief Revenue Officer"],
  };

  const existingCriteria = [
    {
      id: "c1",
      name: "Owns board forecast narrative",
      criterionType: "ownership",
      manuallyEdited: true,
    },
    {
      id: "c2",
      name: "Runs weekly pipeline review",
      criterionType: "responsibility",
      manuallyEdited: false,
    },
  ];

  it("lists preserved manual criteria and rep-approved titles", () => {
    const plan = buildPersonaResynthesisApplyPlan({
      persona,
      existingCriteria,
      before: personaTextSnapshot({
        definition: "Old summary",
        responsibilities: "Old resp",
        painPoints: "Old pain",
        desiredOutcomes: "Old outcome",
        messagingNotes: "Old notes",
      }),
      after: {
        definition: "New summary",
        responsibilities: "New resp",
        painPoints: "New pain",
        desiredOutcomes: "New outcome",
        messagingNotes: "New notes",
      },
      proposedCriteria: [{ name: "New signal", criterionType: "positive" }],
    });

    expect(plan.preserved.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        `${vocab.persona.Singular} id`,
        `${vocab.persona.Singular} name`,
        "Manually edited criterion",
        "Rep-approved likely titles",
      ]),
    );
    expect(
      plan.preserved.find((i) => i.label === "Rep-approved likely titles")
        ?.detail,
    ).toContain("CRO");

    expect(plan.replaced.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        "Role summary",
        "Primary responsibilities",
        "Pain points",
        "Desired outcomes",
        "Messaging notes",
        "AI-generated criteria",
        "Stored AI profile",
      ]),
    );
    expect(plan.fieldDiffs).toHaveLength(5);
  });

  it("omits title preservation when titles were not rep-approved", () => {
    const plan = buildPersonaResynthesisApplyPlan({
      persona: { ...persona, manuallyEditedFields: [] },
      existingCriteria: [],
      before: personaTextSnapshot({
        definition: "Same",
        responsibilities: null,
        painPoints: null,
        desiredOutcomes: null,
        messagingNotes: null,
      }),
      after: {
        definition: "Same",
        responsibilities: "",
        painPoints: "",
        desiredOutcomes: "",
        messagingNotes: "",
      },
      proposedCriteria: [],
    });

    expect(
      plan.preserved.some((item) => item.label === "Rep-approved likely titles"),
    ).toBe(false);
    expect(plan.fieldDiffs).toHaveLength(0);
  });
});
