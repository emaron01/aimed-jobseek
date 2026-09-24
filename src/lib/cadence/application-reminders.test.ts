import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  reminderDueAt,
  shouldIncludeApplicationReminder,
} from "@/lib/cadence/application-reminders";

describe("application reminders", () => {
  const now = new Date("2026-09-24T12:00:00.000Z");
  const upcoming = reminderDueAt(now, 3);
  const due = reminderDueAt(now, 0);

  it("includes upcoming reminders after Applied or a sent message", () => {
    expect(
      shouldIncludeApplicationReminder({
        dueAt: upcoming,
        now,
        includeUpcoming: true,
      }),
    ).toBe(true);
    expect(
      shouldIncludeApplicationReminder({
        dueAt: upcoming,
        now,
        includeUpcoming: false,
      }),
    ).toBe(false);
    expect(
      shouldIncludeApplicationReminder({
        dueAt: due,
        now,
        includeUpcoming: false,
      }),
    ).toBe(true);
    const home = readFileSync("src/lib/workflow/home.ts", "utf8");
    expect(home).toContain("includeUpcoming: true");
  });
});
