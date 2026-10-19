import { describe, expect, it } from "vitest";
import {
  validateMagicBytes,
  sanitizeFilename,
  hashContent,
} from "@/lib/materials/validation";
import { validateUrlForSSRF } from "@/lib/materials/ssrf";
import { chunkText, estimateTokenCount } from "@/lib/materials/chunker";

describe("Materials Validation, SSRF Protection & Chunking Unit Tests", () => {
  describe("1. Magic-Byte File Validation", () => {
    it("rejects an executable renamed to .pdf (Windows PE / MZ header)", () => {
      // 0x4D 0x5A is the DOS MZ header for .exe / .dll
      const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const result = validateMagicBytes(exeBuffer, "pdf");

      expect(result.valid).toBe(false);
      expect(result.isExecutable).toBe(true);
      expect(result.error).toContain("Executable files");
    });

    it("rejects an executable renamed to .txt (Linux ELF header)", () => {
      // 0x7F 0x45 0x4C 0x46 is \x7fELF
      const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
      const result = validateMagicBytes(elfBuffer, "text");

      expect(result.valid).toBe(false);
      expect(result.isExecutable).toBe(true);
      expect(result.error).toContain("Executable files");
    });

    it("rejects a macOS Mach-O executable", () => {
      // 0xFE 0xED 0xFA 0xCE
      const machoBuffer = Buffer.from([0xfe, 0xed, 0xfa, 0xce, 0x00, 0x00, 0x00, 0x01]);
      const result = validateMagicBytes(machoBuffer, "markdown");

      expect(result.valid).toBe(false);
      expect(result.isExecutable).toBe(true);
      expect(result.error).toContain("Mach-O binary");
    });

    it("accepts a genuine PDF header (%PDF-)", () => {
      const pdfBuffer = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj");
      const result = validateMagicBytes(pdfBuffer, "pdf");

      expect(result.valid).toBe(true);
      expect(result.detectedKind).toBe("pdf");
    });

    it("rejects a text file declared as PDF", () => {
      const textBuffer = Buffer.from("Just plain text notes about machine learning.");
      const result = validateMagicBytes(textBuffer, "pdf");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("does not match magic byte signature");
    });

    it("accepts clean UTF-8 text and markdown without null bytes", () => {
      const mdBuffer = Buffer.from("# Data Structures\n\n- Binary Trees\n- Graphs");
      const result = validateMagicBytes(mdBuffer, "markdown");

      expect(result.valid).toBe(true);
      expect(result.detectedKind).toBe("markdown");
    });

    it("rejects text containing binary null bytes", () => {
      const binaryInText = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x00, 0x6f]); // "Hell\0o"
      const result = validateMagicBytes(binaryInText, "text");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Binary content detected");
    });
  });

  describe("2. Filename Sanitization & Duplicate Hashing", () => {
    it("sanitizes dangerous characters and directory traversal attempts", () => {
      expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
      expect(sanitizeFilename("..\\..\\windows\\system32\\cmd.exe")).toBe("cmd.exe");
      expect(sanitizeFilename("Notes & Highlights (Final#1).pdf")).toBe("Notes___Highlights__Final_1_.pdf");
    });

    it("generates deterministic SHA-256 hashes", () => {
      const content = "Consistent document content";
      const hash1 = hashContent(content);
      const hash2 = hashContent(Buffer.from(content));

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });

  describe("3. SSRF Protection on URLs", () => {
    it("blocks localhost and loopback IPv4 (127.0.0.1)", () => {
      const res1 = validateUrlForSSRF("http://localhost:8080/secret");
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain("Blocked SSRF target");

      const res2 = validateUrlForSSRF("http://127.0.0.1/admin");
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain("Blocked SSRF target");
    });

    it("blocks RFC 1918 private IPv4 ranges (10.x, 172.16.x, 192.168.x)", () => {
      expect(validateUrlForSSRF("http://10.0.0.1/internal").valid).toBe(false);
      expect(validateUrlForSSRF("http://172.16.0.5/api").valid).toBe(false);
      expect(validateUrlForSSRF("http://192.168.1.1/router").valid).toBe(false);
    });

    it("blocks cloud instance metadata endpoint (169.254.169.254)", () => {
      const res = validateUrlForSSRF("http://169.254.169.254/latest/meta-data/");
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Blocked SSRF target");
    });

    it("blocks IPv6 loopback (::1)", () => {
      const res = validateUrlForSSRF("http://[::1]:3000/metrics");
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Blocked SSRF target");
    });

    it("allows valid public HTTPS URLs", () => {
      const res = validateUrlForSSRF("https://en.wikipedia.org/wiki/Computer_science");
      expect(res.valid).toBe(true);
      expect(res.url?.hostname).toBe("en.wikipedia.org");
    });
  });

  describe("4. Chunking to ~800 tokens with 100 overlap", () => {
    it("correctly estimates tokens", () => {
      const text = "Learnitt helps users achieve their goals systematically.";
      const tokens = estimateTokenCount(text);
      expect(tokens).toBeGreaterThan(5);
      expect(tokens).toBeLessThan(20);
    });

    it("chunks large content into ~800 token slices with ~100 token overlap", () => {
      // Create a document with 10 distinct paragraphs of ~200 tokens each (~2000 tokens total)
      const paragraphs = Array.from({ length: 10 }, (_, i) => {
        return `Paragraph ${i + 1}: This is structured study content explaining advanced algorithm concepts and complexity analysis in depth. Repetition ensures enough text volume to test chunking thresholds accurately across multiple paragraphs. ${"Data structures and graphs are essential for software engineers. ".repeat(
          8
        )}`;
      });

      const fullText = paragraphs.join("\n\n");
      const chunks = chunkText(fullText, { targetTokens: 800, overlapTokens: 100 });

      expect(chunks.length).toBeGreaterThanOrEqual(2);

      // Verify each chunk has reasonable size
      for (const chunk of chunks) {
        expect(chunk.tokens).toBeGreaterThan(0);
        expect(chunk.tokens).toBeLessThanOrEqual(1000); // within tolerance
      }

      // Check overlap between consecutive chunks
      if (chunks.length > 1) {
        const firstChunk = chunks[0].content;
        const secondChunk = chunks[1].content;
        // Verify second chunk shares content with the end of the first chunk
        const firstChunkWords = firstChunk.split(/\s+/).slice(-20).join(" ");
        expect(secondChunk).toContain(firstChunkWords.slice(0, 30));
      }
    });
  });
});
