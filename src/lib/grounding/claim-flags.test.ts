import { describe, expect, it } from "vitest";
import { applicationAssetConfig } from "@/lib/product-config";
import {
  flagInventedClaims,
  flagInventedLine,
  markClaimSeekerEdited,
  seekerSourceTexts,
} from "@/lib/grounding/claim-flags";

const harborline = {
  sources: [
    {
      category: "PROFILE_FACT",
      text: "Grew the West Coast enterprise book from $9M to $21M in annual contract value over three years.",
    },
    {
      category: "PROFILE_FACT",
      text: "Senior Director, Enterprise Sales. Harborline Software.",
    },
  ],
  profile: {
    experience: [
      { employer: "Harborline Software", title: "Senior Director, Enterprise Sales" },
    ],
  },
};

describe("claim flags", () => {
  it("does not flag a paraphrase of a seeker fact", () => {
    const { texts, names } = seekerSourceTexts(harborline);
    const flag = flagInventedLine({
      claimId: "b1",
      text: "Took Harborline Software's West Coast enterprise book from nine million to twenty-one million in annual contract value.",
      sourceTexts: texts,
      names,
    });
    expect(flag).toBeNull();
  });

  it("flags a number the seeker never provided and still returns the line", () => {
    const { texts, names } = seekerSourceTexts(harborline);
    const record = flagInventedClaims({
      claims: [
        {
          id: "b1",
          text: "Grew the Harborline Software book from $47M to $21M.",
        },
      ],
      sourceTexts: texts,
      names,
    });
    expect(record.flags).toHaveLength(1);
    expect(record.flags[0]?.kind).toBe("NUMBER");
    expect(record.flags[0]?.message).toBe(
      applicationAssetConfig.labels.claimFlag.number,
    );
    expect(record.flags[0]?.status).toBe("OPEN");
  });

  it("never flags seeker-edited text", () => {
    const { texts, names } = seekerSourceTexts(harborline);
    const record = flagInventedClaims({
      claims: [{ id: "b1", text: "Grew the book from $47M to $99M." }],
      sourceTexts: texts,
      names,
      seekerEditedIds: ["b1"],
    });
    expect(record.flags).toHaveLength(0);
    const marked = markClaimSeekerEdited(
      {
        flags: [
          {
            id: "flag_b1",
            claimId: "b1",
            text: "Grew the book from $47M to $99M.",
            kind: "NUMBER",
            message: applicationAssetConfig.labels.claimFlag.number,
            status: "OPEN",
          },
        ],
        seekerEditedIds: [],
      },
      ["b1"],
    );
    expect(marked.flags[0]?.status).toBe("EDITED");
    expect(marked.seekerEditedIds).toContain("b1");
  });
});
