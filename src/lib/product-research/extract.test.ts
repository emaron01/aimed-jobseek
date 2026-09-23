import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  extractDocumentText,
  installPdfjsNodePolyfills,
  PASTE_MATERIALS_NEXT_STEP,
  PDFJS_STUB_MARKERS,
} from "@/lib/product-research/extract";

const GLOBAL_KEYS = ["DOMMatrix", "ImageData", "Path2D"] as const;

function snapshotGlobals() {
  const g = globalThis as Record<string, unknown>;
  return Object.fromEntries(
    GLOBAL_KEYS.map((key) => [key, g[key]]),
  ) as Record<(typeof GLOBAL_KEYS)[number], unknown>;
}

function restoreGlobals(
  snapshot: Record<(typeof GLOBAL_KEYS)[number], unknown>,
) {
  const g = globalThis as Record<string, unknown>;
  for (const key of GLOBAL_KEYS) {
    if (typeof snapshot[key] === "undefined") {
      delete g[key];
    } else {
      g[key] = snapshot[key];
    }
  }
}

function clearPdfjsGlobals() {
  const g = globalThis as Record<string, unknown>;
  for (const key of GLOBAL_KEYS) {
    delete g[key];
  }
}

const FIXTURE_DIR = join(process.cwd(), "tmp", "upload-fixtures");

async function writeDocxFixture(path: string, text: string): Promise<void> {
  const require = createRequire(import.meta.url);
  const JSZip = require("jszip") as typeof import("jszip");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
</w:document>`,
  );
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  writeFileSync(path, buf);
}

describe.sequential("extractDocumentText uploads", () => {
  beforeAll(async () => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    const productLine =
      "Acme sells analytics for mid-market revenue teams who need forecast confidence.";

    writeFileSync(
      join(FIXTURE_DIR, "sample.txt"),
      `Acme Product Overview.\n${productLine}`,
    );
    writeFileSync(
      join(FIXTURE_DIR, "sample.md"),
      `# Acme\n\n${productLine}`,
    );
    writeFileSync(
      join(FIXTURE_DIR, "sample.pdf"),
      [
        "%PDF-1.4",
        "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj",
        "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj",
        "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj",
        "4 0 obj<< /Length 68 >>stream",
        "BT /F1 12 Tf 20 100 Td (Acme sells analytics for mid-market revenue teams.) Tj ET",
        "endstream",
        "endobj",
        "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj",
        "xref",
        "0 6",
        "0000000000 65535 f ",
        "0000000009 00000 n ",
        "0000000058 00000 n ",
        "0000000115 00000 n ",
        "0000000266 00000 n ",
        "0000000385 00000 n ",
        "trailer<< /Size 6 /Root 1 0 R >>",
        "startxref",
        "462",
        "%%EOF",
      ].join("\n"),
    );
    await writeDocxFixture(join(FIXTURE_DIR, "sample.docx"), productLine);
    // Warm pdf-parse / pdfjs (and a real parse) outside the 5s per-test budget.
    await extractDocumentText({
      filename: "sample.pdf",
      mimeType: "application/pdf",
      bytes: readFileSync(join(FIXTURE_DIR, "sample.pdf")),
    });
  }, 30_000);

  it("extracts TXT", async () => {
    const bytes = readFileSync(join(FIXTURE_DIR, "sample.txt"));
    const result = await extractDocumentText({
      filename: "sample.txt",
      mimeType: "text/plain",
      bytes,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toMatch(/Acme sells analytics/i);
    }
  });

  it("extracts MD", async () => {
    const bytes = readFileSync(join(FIXTURE_DIR, "sample.md"));
    const result = await extractDocumentText({
      filename: "sample.md",
      mimeType: "text/markdown",
      bytes,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toMatch(/Acme sells analytics/i);
    }
  });

  it("extracts DOCX", async () => {
    const bytes = readFileSync(join(FIXTURE_DIR, "sample.docx"));
    const result = await extractDocumentText({
      filename: "sample.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toMatch(/Acme sells analytics/i);
    }
  });

  it("extracts PDF even when @napi-rs/canvas native bindings are missing", async () => {
    const bytes = readFileSync(join(FIXTURE_DIR, "sample.pdf"));
    const result = await extractDocumentText({
      filename: "sample.pdf",
      mimeType: "application/pdf",
      bytes,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toMatch(/Acme sells analytics/i);
    }
  });

  it("failed reads include a paste next step", async () => {
    const result = await extractDocumentText({
      filename: "empty.txt",
      mimeType: "text/plain",
      bytes: new Uint8Array(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorSafe).toContain(PASTE_MATERIALS_NEXT_STEP);
      expect(result.errorSafe).not.toMatch(/Could not safely extract/i);
    }
  });
});

describe.sequential("installPdfjsNodePolyfills canvas vs stub", () => {
  let prior: ReturnType<typeof snapshotGlobals>;

  afterEach(() => {
    restoreGlobals(prior);
  });

  it("uses @napi-rs/canvas exports when the native binding loads (simulated)", async () => {
    prior = snapshotGlobals();
    clearPdfjsGlobals();

    class CanvasDOMMatrix {
      static source = "napi-canvas";
    }
    class CanvasImageData {
      static source = "napi-canvas";
    }
    class CanvasPath2D {
      static source = "napi-canvas";
    }

    const report = await installPdfjsNodePolyfills({
      loadCanvas: () => ({
        DOMMatrix: CanvasDOMMatrix,
        ImageData: CanvasImageData,
        Path2D: CanvasPath2D,
      }),
    });

    expect(report).toEqual({
      canvasLoaded: true,
      DOMMatrix: "napi-canvas",
      ImageData: "napi-canvas",
      Path2D: "napi-canvas",
    });
    expect(globalThis.DOMMatrix).toBe(CanvasDOMMatrix);
    expect(globalThis.ImageData).toBe(CanvasImageData);
    expect(globalThis.Path2D).toBe(CanvasPath2D);
    expect(globalThis.DOMMatrix).not.toBe(PDFJS_STUB_MARKERS.DOMMatrix);
  });

  it("installs stubs only when canvas is unavailable", async () => {
    prior = snapshotGlobals();
    clearPdfjsGlobals();

    const report = await installPdfjsNodePolyfills({
      loadCanvas: () => null,
    });

    expect(report).toEqual({
      canvasLoaded: false,
      DOMMatrix: "stub",
      ImageData: "stub",
      Path2D: "stub",
    });
    expect(globalThis.DOMMatrix).toBe(PDFJS_STUB_MARKERS.DOMMatrix);
    expect(globalThis.ImageData).toBe(PDFJS_STUB_MARKERS.ImageData);
    expect(globalThis.Path2D).toBe(PDFJS_STUB_MARKERS.Path2D);
  });

  it("never overwrites globals that are already defined", async () => {
    prior = snapshotGlobals();
    clearPdfjsGlobals();

    class ExistingDOMMatrix {
      static source = "existing";
    }
    (globalThis as Record<string, unknown>).DOMMatrix = ExistingDOMMatrix;

    class CanvasDOMMatrix {
      static source = "napi-canvas";
    }
    const report = await installPdfjsNodePolyfills({
      loadCanvas: () => ({
        DOMMatrix: CanvasDOMMatrix,
        ImageData: class {},
        Path2D: class {},
      }),
    });

    expect(report.DOMMatrix).toBe("existing");
    expect(globalThis.DOMMatrix).toBe(ExistingDOMMatrix);
    expect(report.ImageData).toBe("napi-canvas");
    expect(report.Path2D).toBe("napi-canvas");
  });

  it("default load uses real canvas when available, otherwise stubs", async () => {
    let canvasModule: {
      DOMMatrix?: unknown;
      ImageData?: unknown;
      Path2D?: unknown;
      default?: {
        DOMMatrix?: unknown;
        ImageData?: unknown;
        Path2D?: unknown;
      };
    } | null = null;
    try {
      canvasModule = await import("@napi-rs/canvas");
    } catch {
      canvasModule = null;
    }
    const canvas = canvasModule
      ? (canvasModule.default ?? canvasModule)
      : null;

    prior = snapshotGlobals();
    clearPdfjsGlobals();
    // Inject the resolved canvas so a parallel file cannot leave a leftover
    // DOMMatrix that would report as "existing".
    const report = await installPdfjsNodePolyfills({
      loadCanvas: () =>
        canvas
          ? {
              DOMMatrix: canvas.DOMMatrix,
              ImageData: canvas.ImageData,
              Path2D: canvas.Path2D,
            }
          : null,
    });
    if (canvas?.DOMMatrix) {
      expect(report.canvasLoaded).toBe(true);
      expect(report.DOMMatrix).toBe("napi-canvas");
      expect(globalThis.DOMMatrix).toBe(canvas.DOMMatrix);
      expect(globalThis.DOMMatrix).not.toBe(PDFJS_STUB_MARKERS.DOMMatrix);
    } else {
      expect(report.canvasLoaded).toBe(false);
      expect(report.DOMMatrix).toBe("stub");
      expect(globalThis.DOMMatrix).toBe(PDFJS_STUB_MARKERS.DOMMatrix);
    }
  });
});
