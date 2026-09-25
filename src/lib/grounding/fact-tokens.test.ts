import { describe, expect, it } from "vitest";
import {
  extractFactDates,
  extractFactNumbers,
  factsSupportedBySources,
  hasVisibleText,
} from "@/lib/grounding/fact-tokens";

describe("fact token grounding", () => {
  const known = {
    employers: ["Northwind Analytics", "Contoso Health"],
    titles: ["Senior Software Engineer", "Account Executive"],
  };

  it("treats a faithful paraphrase as supported", () => {
    const source =
      "Led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters. Senior Software Engineer. Northwind Analytics. 2021-01.";
    const claim =
      "As Senior Software Engineer at Northwind Analytics, I rewrote invoice generation and reduced failed billing runs from 8 percent to under 1 percent.";
    expect(factsSupportedBySources(claim, [source], known).ok).toBe(true);
  });

  it("rejects a changed number, date, employer, or title", () => {
    const source =
      "Led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters. Senior Software Engineer. Northwind Analytics. 2021-01.";
    expect(
      factsSupportedBySources(
        "Cut failed billing runs from 18% to under 1% at Northwind Analytics.",
        [source],
        known,
      ).ok,
    ).toBe(false);
    expect(
      factsSupportedBySources(
        "Cut failed billing runs from 8% to under 1% at Northwind Analytics in 2019.",
        [source],
        known,
      ).ok,
    ).toBe(false);
    expect(
      factsSupportedBySources(
        "Cut failed billing runs from 8% to under 1% at Contoso Health.",
        [source],
        known,
      ).ok,
    ).toBe(false);
    expect(
      factsSupportedBySources(
        "As Account Executive at Northwind Analytics, cut failed billing runs from 8% to under 1%.",
        [source],
        known,
      ).ok,
    ).toBe(false);
  });

  it("does not treat shared wording as proof", () => {
    const source = "I used Python for 5 years and cut failed jobs by 40%.";
    const invented = "The team created a nine million dollar metric last year.";
    expect(factsSupportedBySources(invented, [source], known).ok).toBe(false);
    expect(extractFactNumbers(invented)).toContain("9000000");
    expect(extractFactNumbers(source)).toEqual(expect.arrayContaining(["5", "40"]));
  });

  it("treats written and abbreviated money as the same number", () => {
    expect(extractFactNumbers("$9M to $21M")).toEqual(
      expect.arrayContaining(["9000000", "21000000"]),
    );
    expect(
      extractFactNumbers(
        "from nine million to twenty-one million in annual contract value",
      ),
    ).toEqual(expect.arrayContaining(["9000000", "21000000"]));
    expect(
      factsSupportedBySources(
        "Took Harborline Software's West Coast enterprise book from nine million to twenty-one million in annual contract value.",
        [
          "Grew the West Coast enterprise book from $9M to $21M in annual contract value over three years. Harborline Software.",
        ],
        { employers: ["Harborline Software"], titles: [] },
      ).ok,
    ).toBe(true);
  });

  it("normalizes month-year dates and hides empty text", () => {
    expect(extractFactDates("January 2021 through 2023")).toEqual(
      expect.arrayContaining([
        { year: 2021, month: 1 },
        { year: 2023, month: null },
      ]),
    );
    expect(hasVisibleText("   ")).toBe(false);
    expect(hasVisibleText("Saved.")).toBe(true);
    expect(
      factsSupportedBySources(
        "Safe when sources are thin.",
        [undefined as unknown as string],
        { employers: [undefined as unknown as string], titles: [] },
      ).ok,
    ).toBe(true);
  });
});
