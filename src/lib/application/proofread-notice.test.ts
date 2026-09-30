import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applicationAssetConfig } from "@/lib/product-config";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

const PROOFREAD_TEXT =
  "Proofread your resume and cover letter before you send them. Harper is AI and can make mistakes.";

describe("resume and cover letter proofread notice", () => {
  const section = src("src/components/ApplicationAssetsSection.tsx");
  const assetsPage = src("src/app/(app)/campaigns/[id]/assets/page.tsx");
  const workspace = src("src/components/ApplicationWorkspace.tsx");

  it("renders the exact proofread notice at the top in the existing warning style, bold and not dismissible", () => {
    expect(applicationAssetConfig.labels.proofreadNotice).toBe(PROOFREAD_TEXT);

    const noticeStart = section.indexOf('data-testid="assets-proofread-notice"');
    expect(noticeStart).toBeGreaterThan(0);
    const noticeBlock = section.slice(
      noticeStart,
      section.indexOf("</p>", noticeStart) + 4,
    );
    expect(noticeBlock).toContain("proofreadNotice");
    expect(noticeBlock).toContain("rounded-md border border-warning bg-warning-tint");
    expect(noticeBlock).toContain("font-bold");
    expect(noticeBlock).toContain("text-warning");
    expect(noticeBlock).not.toContain("dismiss");
    expect(noticeBlock).not.toContain("onClick");
    expect(noticeBlock).not.toContain("button");

    const contentStart = section.indexOf('className="mt-4 space-y-4"');
    expect(contentStart).toBeGreaterThan(0);
    expect(noticeStart).toBeGreaterThan(contentStart);
    expect(noticeStart).toBeLessThan(
      section.indexOf("{applicationAssetConfig.labels.viewEditResume}"),
    );
    expect(noticeStart).toBeLessThan(section.indexOf("<AssetTypePanel"));
  });

  it("always shows the notice whether or not documents exist", () => {
    const panelCall = section.indexOf("<AssetTypePanel");
    expect(panelCall).toBeGreaterThan(0);
    expect(section.indexOf('data-testid="assets-proofread-notice"')).toBeLessThan(
      panelCall,
    );
    // Notice is not gated on rows / assets length.
    const noticeFn = section.slice(
      section.indexOf("export function ApplicationAssetsSection"),
      section.indexOf("<AssetTypePanel"),
    );
    expect(noticeFn).toContain("assets-proofread-notice");
    expect(noticeFn).not.toMatch(
      /assets-proofread-notice[\s\S]*(rows\.length|valid\.length|assets\.length)/,
    );
  });

  it("rendering the assets page makes no paid call and enqueues no job", () => {
    expect(assetsPage).toContain("ApplicationWorkspace");
    expect(assetsPage).toContain('focus="assets"');
    expect(assetsPage).not.toContain("enqueueApplicationJob");
    expect(assetsPage).not.toContain("generateResumeWithModel");
    expect(assetsPage).not.toContain("generateCoverLetterWithModel");
    expect(assetsPage).not.toContain("generateStructured");

    const assetsRender = workspace.slice(
      workspace.indexOf('showFocus(focus, ["assets"])'),
      workspace.indexOf('showFocus(focus, ["outreach"])'),
    );
    expect(assetsRender).toContain("ApplicationAssetsSection");
    expect(assetsRender).not.toContain("enqueueApplicationJob");
    expect(assetsRender).not.toContain("generateResumeWithModel");
    expect(assetsRender).not.toContain("generateCoverLetterWithModel");
    expect(assetsRender).not.toContain("generateStructured");
  });
});
