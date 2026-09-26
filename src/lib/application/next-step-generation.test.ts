import { beforeEach, describe, expect, it, vi } from "vitest";

const generateStructured = vi.hoisted(() => vi.fn());
const isConsultationAiConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationAiConfigured,
    getConsultationAiProvider: () => ({ generateStructured }),
  };
});

import { writeApplicationNextStep } from "@/lib/application/next-step";
import { consultationConfig } from "@/lib/product-config";

describe("application next-step generation", () => {
  beforeEach(() => {
    isConsultationAiConfigured.mockReturnValue(true);
    generateStructured.mockReset();
  });

  it("saves the last parseable line after quality rejects", async () => {
    const text = `Schedule your initial consultation with ${consultationConfig.displayName}.`;
    generateStructured.mockResolvedValue({ data: { text } });
    const written = await writeApplicationNextStep({
      state: { key: "consultation_not_started", facts: { consultation: "not_started" } },
    });
    expect(written.ok).toBe(true);
    if (written.ok) expect(written.text).toBe(text);
    expect(generateStructured.mock.calls.length).toBeGreaterThan(1);
  });

  it("retries only when the model output is unparseable", async () => {
    generateStructured.mockRejectedValue(new Error("provider timeout"));
    const written = await writeApplicationNextStep({
      state: { key: "consultation_not_started", facts: { consultation: "not_started" } },
    });
    expect(written.ok).toBe(false);
  });
});
