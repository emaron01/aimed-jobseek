/**
 * Product URL page retrieval with SSRF-safe redirects.
 */

import {
  assertSafeExternalHttpUrl,
  safeFetchHttp,
} from "@/lib/research/url-safety";
import {
  formatProductUrlUnreadableError,
  isUsableProductUrlExtraction,
} from "@/lib/product-research/extraction-quality";
import { brandUserAgent } from "@/lib/product-config";

export type FetchedPage = {
  url: string;
  title: string | null;
  text: string;
  ok: boolean;
  /** Characters extracted before usability rejection (for user messaging). */
  extractedCharCount?: number;
  errorSafe?: string;
};

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match?.[1]) return null;
  return match[1].replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

function htmlToTextSnippet(html: string, maxLen = 8000): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  return withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export async function fetchProductPageUrl(
  url: string,
  timeoutMs = 12_000,
): Promise<FetchedPage> {
  const initial = assertSafeExternalHttpUrl(url);
  if (!initial.ok) {
    return {
      url,
      title: null,
      text: "",
      ok: false,
      extractedCharCount: 0,
      errorSafe: initial.reason,
    };
  }

  try {
    const response = await safeFetchHttp(initial.href, {
      method: "GET",
      timeoutMs,
      headers: {
        "User-Agent": brandUserAgent("ProductResearch"),
      },
    });

    if (!response.ok) {
      return {
        url: initial.href,
        title: null,
        text: "",
        ok: false,
        extractedCharCount: 0,
        errorSafe: `URL returned HTTP ${response.status}. ${formatProductUrlUnreadableError({ extractedCharCount: 0, blockedOrEmpty: true })}`,
      };
    }

    // Final URL after redirects must also be safe (already checked per hop).
    const finalUrl = response.url || initial.href;
    const finalSafe = assertSafeExternalHttpUrl(finalUrl);
    if (!finalSafe.ok) {
      return {
        url: initial.href,
        title: null,
        text: "",
        ok: false,
        extractedCharCount: 0,
        errorSafe: finalSafe.reason,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml") &&
      !contentType.includes("text/plain")
    ) {
      return {
        url: finalSafe.href,
        title: null,
        text: "",
        ok: false,
        extractedCharCount: 0,
        errorSafe:
          "This URL did not return readable page text. Paste the product description into the paste field and try again.",
      };
    }
    const html = await response.text();
    const text = htmlToTextSnippet(html);
    const title = extractTitle(html);
    if (!text) {
      return {
        url: finalSafe.href,
        title,
        text: "",
        ok: false,
        extractedCharCount: 0,
        errorSafe: formatProductUrlUnreadableError({
          extractedCharCount: 0,
          blockedOrEmpty: true,
        }),
      };
    }
    if (!isUsableProductUrlExtraction(text)) {
      return {
        url: finalSafe.href,
        title,
        text: "",
        ok: false,
        extractedCharCount: text.length,
        errorSafe: formatProductUrlUnreadableError({
          extractedCharCount: text.length,
          blockedOrEmpty: false,
        }),
      };
    }
    return {
      url: finalSafe.href,
      title,
      text,
      ok: true,
      extractedCharCount: text.length,
    };
  } catch (error) {
    return {
      url: initial.href,
      title: null,
      text: "",
      ok: false,
      extractedCharCount: 0,
      errorSafe:
        error instanceof Error
          ? `${error.message.slice(0, 160)}. ${formatProductUrlUnreadableError({ extractedCharCount: 0, blockedOrEmpty: true })}`
          : formatProductUrlUnreadableError({
              extractedCharCount: 0,
              blockedOrEmpty: true,
            }),
    };
  }
}
