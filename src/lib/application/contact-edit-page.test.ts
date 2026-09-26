import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  workspaceApplicationContactsHref,
  workspaceContactEditHref,
} from "@/lib/application/workspace-links";
import { outreachConfig, vocab } from "@/lib/product-config";

describe("contact edit entry points", () => {
  it("opens the same prefilled form from every Edit shortcut", () => {
    const form = readFileSync("src/components/ContactEditForm.tsx", "utf8");
    const editPage = readFileSync("src/app/(app)/contacts/[contactId]/edit/page.tsx", "utf8");
    const global = readFileSync("src/app/(app)/contacts/page.tsx", "utf8");
    const application = readFileSync(
      "src/app/(app)/campaigns/[id]/contacts/page.tsx",
      "utf8",
    );
    const outreach = readFileSync("src/components/ApplicationOutreachSections.tsx", "utf8");
    const hiringTeam = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    const stage = readFileSync("src/components/InterviewStagePanel.tsx", "utf8");
    expect(editPage).toContain("ContactEditForm");
    expect(form).toContain("updateApplicationContactAction");
    expect(form).toContain("defaultValue={values.firstName}");
    expect(form).toContain("defaultValue={values.lastName}");
    expect(form).toContain("defaultValue={values.title}");
    expect(form).toContain("defaultValue={values.email}");
    expect(form).toContain("defaultValue={values.linkedinUrl}");
    expect(form).toContain("pasteInterviewerProfile");
    expect(form).toContain('name="personaId"');
    expect(editPage).toContain("selected.chosenPersonaId");
    expect(editPage).toContain("archivedAt: null");
    expect(global).toContain("workspaceContactEditHref");
    expect(application).toContain("workspaceContactEditHref");
    expect(outreach).toContain("workspaceContactEditHref");
    expect(hiringTeam).toContain("workspaceContactEditHref");
    expect(stage).toContain("workspaceContactEditHref");
    expect(workspaceContactEditHref("c1", "camp_1")).toBe(
      "/contacts/c1/edit?campaignId=camp_1",
    );
    expect(outreachConfig.labels.editContact).toBe("Edit");
  });

  it("lists only the application's contacts and links Contacts after the numbered steps", () => {
    const application = readFileSync(
      "src/app/(app)/campaigns/[id]/contacts/page.tsx",
      "utf8",
    );
    const tracker = readFileSync(
      "src/components/ApplicationSidebarTracker.tsx",
      "utf8",
    );
    expect(application).toContain("listApplicationContacts");
    expect(application).toContain("data-testid=\"application-contacts-page\"");
    expect(workspaceApplicationContactsHref("camp_1")).toBe(
      "/campaigns/camp_1/contacts",
    );
    expect(tracker).toContain("workspaceApplicationContactsHref");
    expect(tracker).toContain("tracker-application-contacts");
    expect(tracker.indexOf("tracker.steps.map")).toBeLessThan(
      tracker.indexOf("tracker-application-contacts"),
    );
    expect(tracker).toContain("vocab.contact.Plural");
    expect(vocab.contact.Plural).toBe("Contacts");
  });
});
