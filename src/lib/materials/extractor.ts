import { MaterialKind } from "./types";
import { validateUrlForSSRF } from "./ssrf";

export interface ExtractionResult {
  text: string;
  title?: string;
  error?: string;
}

/**
 * Extracts plain text from an HTML document string by stripping script/style
 * blocks and HTML tags while extracting title.
 */
export function extractTextFromHtml(html: string): { text: string; title?: string } {
  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : undefined;

  // Remove scripts, styles, noscript, svg, head
  let clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, " ");

  // Replace block tags with newlines
  clean = clean.replace(/<\/(p|div|h[1-6]|li|tr|article|section|header|footer)>/gi, "\n\n");
  clean = clean.replace(/<br\s*\/?>/gi, "\n");

  // Strip all other HTML tags
  clean = clean.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  clean = clean
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Collapse multiple whitespaces and excessive newlines
  clean = clean.replace(/[ \t]+/g, " ");
  clean = clean.replace(/\n\s*\n\s*\n+/g, "\n\n");

  return { text: clean.trim(), title };
}

/**
 * Extracts plain text from PDF, DOCX, Markdown, Text, and URLs.
 * PRD Epic B1 & Prompt Requirement 2:
 * "Extract text from each type (a PDF parser and a DOCX parser, with timeouts).
 *  URLs: fetch the page and extract readable text, with a size limit and a block on private IP ranges.
 *  Failures set status needs_attention with a readable reason. The file stays."
 */
export async function extractTextFromMaterial(params: {
  kind: MaterialKind;
  buffer?: Buffer;
  sourceUrl?: string;
  timeoutMs?: number;
}): Promise<ExtractionResult> {
  const timeoutMs = params.timeoutMs || 15000;

  // 1. URL extraction
  if (params.kind === "url") {
    if (!params.sourceUrl) {
      throw new Error("Missing sourceUrl for URL material.");
    }

    // SSRF Check
    const ssrf = validateUrlForSSRF(params.sourceUrl);
    if (!ssrf.valid || !ssrf.url) {
      throw new Error(ssrf.error || "Blocked URL target.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(ssrf.url.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent": "Learnitt-Bot/1.0 (+https://learnitt.app)",
          Accept: "text/html,application/xhtml+xml,text/plain",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch URL: HTTP ${response.status} ${response.statusText}`);
      }

      // 5 MB size limit
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
        throw new Error("URL page content exceeds the 5 MB maximum download limit.");
      }

      const html = await response.text();
      const parsed = extractTextFromHtml(html);

      if (!parsed.text || parsed.text.length < 20) {
        throw new Error("Extracted URL page contains insufficient readable text.");
      }

      return { text: parsed.text, title: parsed.title };
    } finally {
      clearTimeout(timeout);
    }
  }

  // 2. Buffer-based extraction (PDF, DOCX, Markdown, Text)
  const buffer = params.buffer;
  if (!buffer || buffer.length === 0) {
    throw new Error("No file content buffer provided for extraction.");
  }

  // Markdown & Text
  if (params.kind === "markdown" || params.kind === "text" || params.kind === "plan_import") {
    const text = buffer.toString("utf-8").trim();
    if (!text) {
      throw new Error("Text document is empty.");
    }
    return { text };
  }

  // PDF Extraction using pdf-parse v2 PDFParse class with timeout
  if (params.kind === "pdf") {
    return new Promise<ExtractionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("PDF text extraction timed out after 15 seconds."));
      }, timeoutMs);

      (async () => {
        try {
          // Dynamic require / import to prevent client bundle leaks
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pdfLib = require("pdf-parse");
          const PDFParse = pdfLib.PDFParse || pdfLib.default?.PDFParse;

          if (PDFParse) {
            const parser = new PDFParse({ data: buffer });
            await parser.load();
            const textResult = await parser.getText();
            await parser.destroy();
            clearTimeout(timer);

            const rawText = (typeof textResult === "object" && textResult?.text) ? textResult.text : String(textResult);
            const cleanText = rawText.replace(/\n\s*-- \d+ of \d+ --\s*\n/g, "\n\n").trim();

            if (!cleanText) {
              reject(new Error("PDF contains no extractable text (document may be scanned or empty)."));
              return;
            }
            resolve({ text: cleanText });
          } else {
            // Fallback functional API
            const data = await pdfLib(buffer);
            clearTimeout(timer);
            resolve({ text: data.text.trim() });
          }
        } catch (err: unknown) {
          clearTimeout(timer);
          reject(new Error(`PDF text extraction failed: ${(err as Error).message}`));
        }
      })();
    });
  }

  // DOCX Extraction using mammoth with timeout
  if (params.kind === "docx") {
    return new Promise<ExtractionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("DOCX text extraction timed out after 15 seconds."));
      }, timeoutMs);

      (async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const mammoth = require("mammoth");
          const result = await mammoth.extractRawText({ buffer });
          clearTimeout(timer);

          const cleanText = result.value.trim();
          if (!cleanText) {
            reject(new Error("DOCX contains no extractable text."));
            return;
          }
          resolve({ text: cleanText });
        } catch (err: unknown) {
          clearTimeout(timer);
          reject(new Error(`DOCX text extraction failed: ${(err as Error).message}`));
        }
      })();
    });
  }

  throw new Error(`Unsupported material kind: '${params.kind}'.`);
}
