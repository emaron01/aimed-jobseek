import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applicationReminderDigest,
  dueReminderLine,
  groupDueApplicationReminders,
  type ApplicationReminderRow,
} from "@/lib/cadence/application-reminders";

const now = new Date("2026-10-01T18:00:00.000Z");

function reminder(
  overrides: Partial<ApplicationReminderRow> = {},
): ApplicationReminderRow {
  return {
    campaignId: "camp-csc",
    campaignName: "CSC Sr. Director",
    kind: "INTERVIEW_THANK_YOU",
    appliedAt: new Date("2026-09-01T00:00:00.000Z"),
    stageId: "stage-1",
    stageLabel: "HIRING_MANAGER",
    anchorAt: new Date("2026-09-30T15:00:00.000Z"),
    day: 0,
    dueAt: new Date("2026-10-01T15:00:00.000Z"),
    urgency: "today",
    recordNotesFirst: true,
    ...overrides,
  };
}

function home(reminders: ApplicationReminderRow[], timezone: string) {
  return groupDueApplicationReminders({ reminders, now, timezone });
}

describe("digest application reminders match the home page", () => {
  const reminders = [
    reminder(),
    reminder({ stageId: "stage-duplicate" }),
    reminder({
      kind: "OUTREACH",
      stageId: undefined,
      stageLabel: undefined,
      day: 3,
      dueAt: new Date("2026-10-01T12:00:00.000Z"),
      recordNotesFirst: false,
    }),
    reminder({
      campaignId: "camp-later",
      campaignName: "Later Co",
      kind: "OUTREACH",
      stageId: undefined,
      stageLabel: undefined,
      day: 7,
      dueAt: new Date("2026-10-15T15:00:00.000Z"),
      recordNotesFirst: false,
    }),
  ];

  it("uses the same count and per-application lines as the home page", () => {
    const digest = applicationReminderDigest({
      reminders,
      now,
      timezone: "America/New_York",
    });
    const groups = home(reminders, "America/New_York");
    expect(digest.count).toBe(groups.reduce((sum, group) => sum + group.count, 0));
    expect(digest.lines).toEqual(
      groups.map((group) => `${group.campaignName}: ${dueReminderLine(group.count)}`),
    );
    expect(digest.lines).toEqual([
      "CSC Sr. Director: You may have 2 outbound due. Review Interview stages and Send Outreach to take action.",
    ]);
    expect(digest.html).toContain(
      "You may have 2 outbound due. Review Interview stages and Send Outreach to take action.",
    );
    expect(digest.lines.join("\n")).not.toContain("Later Co");
  });

  it("does not count future reminders", () => {
    const digest = applicationReminderDigest({
      reminders: [
        reminder({
          kind: "OUTREACH",
          stageId: undefined,
          stageLabel: undefined,
          day: 7,
          dueAt: new Date("2026-10-20T15:00:00.000Z"),
          recordNotesFirst: false,
        }),
      ],
      now,
      timezone: "America/New_York",
    });
    expect(digest.count).toBe(0);
    expect(digest.lines).toEqual([]);
  });

  it("counts a duplicated stored reminder once", () => {
    const digest = applicationReminderDigest({
      reminders: [reminder(), reminder({ stageId: "stage-copy" })],
      now,
      timezone: "America/New_York",
    });
    expect(digest.count).toBe(1);
    expect(digest.lines).toEqual([
      "CSC Sr. Director: You may have 1 outbound due. Review Interview stages and Send Outreach to take action.",
    ]);
  });

  it("uses the seeker's time zone to decide today", () => {
    const edge = [
      reminder({
        kind: "OUTREACH",
        stageId: undefined,
        stageLabel: undefined,
        day: 1,
        dueAt: new Date("2026-10-02T03:00:00.000Z"),
        recordNotesFirst: false,
      }),
    ];
    const eastern = applicationReminderDigest({
      reminders: edge,
      now,
      timezone: "America/New_York",
    });
    const utc = applicationReminderDigest({
      reminders: edge,
      now,
      timezone: "UTC",
    });
    expect(eastern.count).toBe(home(edge, "America/New_York").reduce((sum, group) => sum + group.count, 0));
    expect(eastern.count).toBe(1);
    expect(utc.count).toBe(0);
    expect(utc.lines).toEqual([]);
  });

  it("adds no reminder content when nothing is due today or past due", () => {
    const digest = applicationReminderDigest({
      reminders: [
        reminder({
          dueAt: new Date("2026-11-01T15:00:00.000Z"),
        }),
      ],
      now,
      timezone: "America/New_York",
    });
    expect(digest.count).toBe(0);
    expect(digest.lines).toEqual([]);
    expect(digest.html).toBe("");
    expect(digest.html).not.toContain("You may have");
  });

  it("wires the digest total to that home-page count and still skips an empty send", () => {
    const source = readFileSync("src/lib/cadence/digest.ts", "utf8");
    expect(source).toContain("applicationReminderDigest");
    expect(source).toContain("includeUpcoming: true");
    expect(source).toContain("contactDueCount + applicationReminders.count");
    expect(source).toContain('reminderLines: applicationReminders.lines.join("\\n")');
    expect(source).not.toContain("countDueApplicationReminders");
    expect(source).toContain('bumpSkip(result, "no_due_contacts"');
  });
});
