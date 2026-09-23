/**
 * Safe document text extraction for Product materials.
 * Never executes macros/scripts. Unsupported types fail closed.
 *
 * PDF path: pdf-parse v2 → pdfjs-dist needs DOMMatrix. Prefer real
 * @napi-rs/canvas bindings when they load; only install minimal stubs when
 * those globals are still missing (e.g. Windows ARM64 without a native binary).
 * Stubs must never shadow a successful canvas load — pdfjs itself only fills
 * globals when `!globalThis.DOMMatrix` (same for ImageData / Path2D).
 */

export type ExtractResult =
  | { ok: true; text: string; mimeType: string }
  | { ok: false; errorSafe: string };

const MAX_EXTRACT_CHARS = 200_000;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MiB

/** Shared next step whenever a source cannot be read. */
export const PASTE_MATERIALS_NEXT_STEP =
  "Paste resume or LinkedIn profile text into the paste field and try again.";

export const SUPPORTED_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".markdown",
] as const;

export const SUPPORTED_UPLOAD_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/octet-stream", // allow when extension is trusted
]);

function withPasteHint(problem: string): string {
  const trimmed = problem.trim().replace(/\.$/, "");
  return `${trimmed}. ${PASTE_MATERIALS_NEXT_STEP}`;
}

export function getUploadExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

export function isSupportedUpload(filename: string, mimeType: string): boolean {
  const ext = getUploadExtension(filename);
  if (!(SUPPORTED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
    return false;
  }
  // PPTX intentionally unsupported for now — abstraction allows later add.
  if (ext === ".pptx") return false;
  const mime = mimeType.toLowerCase().split(";")[0]!.trim();
  if (mime === "application/octet-stream") return true;
  if (ext === ".pdf")
    return mime === "application/pdf" || mime === "application/octet-stream";
  if (ext === ".docx") {
    return (
      mime.includes("wordprocessingml") ||
      mime === "application/octet-stream" ||
      mime === "application/zip"
    );
  }
  if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
    return mime.startsWith("text/") || mime === "application/octet-stream";
  }
  return SUPPORTED_UPLOAD_MIMES.has(mime);
}

export function assertUploadSize(byteLength: number): ExtractResult | null {
  if (byteLength <= 0) {
    return {
      ok: false,
      errorSafe: withPasteHint("Uploaded file is empty"),
    };
  }
  if (byteLength > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      errorSafe: withPasteHint(
        `Uploaded file exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB limit`,
      ),
    };
  }
  return null;
}

function truncate(text: string): string {
  const cleaned = text.replace(/\u0000/g, "").trim();
  if (cleaned.length <= MAX_EXTRACT_CHARS) return cleaned;
  return `${cleaned.slice(0, MAX_EXTRACT_CHARS)}\n\n[truncated]`;
}

export type PdfjsCanvasGlobals = {
  DOMMatrix?: unknown;
  ImageData?: unknown;
  Path2D?: unknown;
};

export type PdfjsPolyfillSource = "existing" | "napi-canvas" | "stub" | "missing";

export type PdfjsPolyfillReport = {
  canvasLoaded: boolean;
  DOMMatrix: PdfjsPolyfillSource;
  ImageData: PdfjsPolyfillSource;
  Path2D: PdfjsPolyfillSource;
};

class StubDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  multiplySelf() {
    return this;
  }
  translateSelf() {
    return this;
  }
  scaleSelf() {
    return this;
  }
  multiply() {
    return new StubDOMMatrix();
  }
  translate() {
    return new StubDOMMatrix();
  }
  scale() {
    return new StubDOMMatrix();
  }
  inverse() {
    return new StubDOMMatrix();
  }
}

class StubImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  constructor(width = 1, height = 1) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

class StubPath2D {}

/** Marker used in tests to recognize stub installs (not for production checks). */
export const PDFJS_STUB_MARKERS = {
  DOMMatrix: StubDOMMatrix,
  ImageData: StubImageData,
  Path2D: StubPath2D,
} as const;

async function loadNapiCanvas(): Promise<PdfjsCanvasGlobals | null> {
  try {
    const mod = (await import("@napi-rs/canvas")) as PdfjsCanvasGlobals & {
      default?: PdfjsCanvasGlobals;
    };
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

function assignMissingGlobal(
  g: Record<string, unknown>,
  key: keyof PdfjsCanvasGlobals,
  canvas: PdfjsCanvasGlobals | null,
  stub: unknown,
): PdfjsPolyfillSource {
  if (typeof g[key] !== "undefined") {
    return "existing";
  }
  if (canvas?.[key]) {
    g[key] = canvas[key];
    return "napi-canvas";
  }
  if (stub) {
    g[key] = stub;
    return "stub";
  }
  return "missing";
}

/**
 * Install Node globals pdfjs needs for text extraction.
 * Prefer a successful @napi-rs/canvas load; only stub what is still missing.
 * Never overwrites globals that are already defined.
 */
function applyPdfjsNodePolyfills(
  canvas: PdfjsCanvasGlobals | null,
): PdfjsPolyfillReport {
  const g = globalThis as Record<string, unknown>;
  return {
    canvasLoaded: Boolean(canvas),
    DOMMatrix: assignMissingGlobal(g, "DOMMatrix", canvas, StubDOMMatrix),
    ImageData: assignMissingGlobal(g, "ImageData", canvas, StubImageData),
    Path2D: assignMissingGlobal(g, "Path2D", canvas, StubPath2D),
  };
}

export async function installPdfjsNodePolyfills(options?: {
  /** Test seam — override canvas load (return null to force stub path). */
  loadCanvas?: () => Promise<PdfjsCanvasGlobals | null> | PdfjsCanvasGlobals | null;
}): Promise<PdfjsPolyfillReport> {
  // Keep the sync loadCanvas path fully synchronous so tests can clear
  // globals and assign in the same turn (no microtask race on globalThis).
  if (options?.loadCanvas) {
    const loaded = options.loadCanvas();
    if (loaded && typeof (loaded as Promise<unknown>).then === "function") {
      return applyPdfjsNodePolyfills(await loaded);
    }
    return applyPdfjsNodePolyfills(loaded as PdfjsCanvasGlobals | null);
  }
  return applyPdfjsNodePolyfills(await loadNapiCanvas());
}

async function extractPdfText(bytes: Uint8Array): Promise<ExtractResult> {
  await installPdfjsNodePolyfills();
  // pdf-parse v2+: class API (PDFParse), not a default function.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: Buffer.from(bytes) });
  try {
    const parsed = await parser.getText();
    const text = (parsed.text || "").trim();
    if (!text) {
      return {
        ok: false,
        errorSafe: withPasteHint(
          "This PDF has no extractable text (it may be image-only or scanned)",
        ),
      };
    }
    return { ok: true, text: truncate(text), mimeType: "application/pdf" };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export async function extractDocumentText(input: {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<ExtractResult> {
  const sizeErr = assertUploadSize(input.bytes.byteLength);
  if (sizeErr) return sizeErr;

  if (!isSupportedUpload(input.filename, input.mimeType)) {
    return {
      ok: false,
      errorSafe: withPasteHint(
        "Unsupported file type. Supported: PDF, DOCX, TXT, MD. PPTX is not enabled yet",
      ),
    };
  }

  const ext = getUploadExtension(input.filename);

  try {
    if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(
        input.bytes,
      );
      if (!text.trim()) {
        return {
          ok: false,
          errorSafe: withPasteHint("Document contained no extractable text"),
        };
      }
      return { ok: true, text: truncate(text), mimeType: input.mimeType };
    }

    if (ext === ".docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({
        buffer: Buffer.from(input.bytes),
      });
      const text = (result.value || "").trim();
      if (!text) {
        return {
          ok: false,
          errorSafe: withPasteHint("DOCX contained no extractable text"),
        };
      }
      return {
        ok: true,
        text: truncate(text),
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }

    if (ext === ".pdf") {
      return extractPdfText(input.bytes);
    }

    return {
      ok: false,
      errorSafe: withPasteHint("Unsupported file type for extraction"),
    };
  } catch (error) {
    const detail =
      error instanceof Error && error.message.includes("DOMMatrix")
        ? "PDF reader could not start in this environment"
        : "Could not read text from this document";
    return {
      ok: false,
      errorSafe: withPasteHint(detail),
    };
  }
}
