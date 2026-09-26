/**
 * Product save parsing + action/UI seam tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseProductFormData,
  readProductFormValues,
  toSafeProductActionError,
} from "@/lib/product/save";
import { TenantError } from "@/lib/tenant/errors";
import { vocab } from "@/lib/product-config";

function formFrom(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

describe("parseProductFormData", () => {
  it("accepts a valid create payload", () => {
    const parsed = parseProductFormData(
      formFrom({
        id: "",
        name: "Forecast OS",
        description: "Pipeline forecasting",
        websiteUrl: "https://example.com",
      }),
    );
    expect(parsed.fieldErrors).toEqual({});
    expect(parsed.fields.name).toBe("Forecast OS");
    expect(parsed.fields.websiteUrl).toBe("https://example.com");
  });

  it("names the product name field when missing", () => {
    const parsed = parseProductFormData(
      formFrom({
        name: "  ",
        description: "Preserve this description on failure.",
      }),
    );
    expect(parsed.fieldErrors.name).toBe(
      `${vocab.product.Singular} name is required.`,
    );
    expect(parsed.values.description).toContain("Preserve this description");
  });

  it("names AOV when invalid", () => {
    const parsed = parseProductFormData(
      formFrom({
        name: "Widget",
        averageOrderValue: "not-a-number",
      }),
    );
    expect(parsed.fieldErrors.averageOrderValue).toMatch(/number/i);
  });
});

describe("toSafeProductActionError", () => {
  it("surfaces TenantError messages", () => {
    expect(
      toSafeProductActionError(new TenantError("Product name is required.")),
    ).toBe("Product name is required.");
  });
});

describe("readProductFormValues", () => {
  it("echoes description for restore-on-failure", () => {
    const values = readProductFormValues(
      formFrom({
        name: "X",
        description: "Preserve this long product description.",
      }),
    );
    expect(values.description).toBe("Preserve this long product description.");
  });
});

describe("Product save UI seam", () => {
  it("wires useActionState result into visible status on success and failure", () => {
    const formSrc = readFileSync(
      "src/components/CandidateProfileEditForm.tsx",
      "utf8",
    );
    const actionsSrc = readFileSync(
      "src/app/actions/candidate-profile.ts",
      "utf8",
    );
    const setupSrc = readFileSync("src/app/(app)/products/new/page.tsx", "utf8");

    expect(actionsSrc).toMatch(
      /export async function saveCandidateProfileAction\([\s\S]*Promise<CandidateProfileActionResult>/,
    );
    expect(actionsSrc).toContain("ok: true");
    expect(actionsSrc).toContain("manuallyEditedFields");

    expect(formSrc).toContain("useActionState");
    expect(formSrc).toContain("saveCandidateProfileAction");
    expect(formSrc).toContain('data-testid="candidate-profile-edit-status"');
    expect(formSrc).toContain("state.message");

    expect(setupSrc).toContain("AssistedProductIntake");
    expect(setupSrc).not.toContain("AddProductForm");
    expect(setupSrc).not.toContain("action={upsertProductAction}");
    const intakeSrc = readFileSync(
      "src/components/AssistedProductSetup.tsx",
      "utf8",
    );
    expect(intakeSrc).not.toContain("encType=");
    expect(intakeSrc).toContain("Try building again");
  });
});
