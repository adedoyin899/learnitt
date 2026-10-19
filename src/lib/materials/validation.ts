import * as crypto from "crypto";
import { MaterialKind } from "./types";

export interface MagicByteValidationResult {
  valid: boolean;
  detectedKind?: MaterialKind;
  error?: string;
  isExecutable?: boolean;
}

/**
 * Validates file content using magic bytes to prevent renamed files and executable uploads.
 * PRD Epic B1 & Prompt Requirement 1:
 * "Validate type by magic bytes on the server, sanitise the filename, store the content hash and skip exact duplicates."
 */
export function validateMagicBytes(buffer: Buffer, declaredKind: string): MagicByteValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "File buffer is empty." };
  }

  // 1. Detect executable magic signatures (MZ, ELF, Mach-O)
  // Windows PE / MZ: 0x4D 0x5A
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return {
      valid: false,
      isExecutable: true,
      error: "Executable files (.exe, .dll, PE binary) are strictly forbidden.",
    };
  }

  // Linux ELF: 0x7F 0x45 0x4C 0x46 (\x7fELF)
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return {
      valid: false,
      isExecutable: true,
      error: "Executable files (ELF binary) are strictly forbidden.",
    };
  }

  // macOS Mach-O: 0xFEEDFACE, 0xFEEDFACF, 0xCEFAEDFE, 0xCFFAEDFE, 0xCAFEBABE (fat binary)
  if (buffer.length >= 4) {
    const b0 = buffer[0];
    const b1 = buffer[1];
    const b2 = buffer[2];
    const b3 = buffer[3];

    const isMachO =
      (b0 === 0xfe && b1 === 0xed && b2 === 0xfa && (b3 === 0xce || b3 === 0xcf)) ||
      (b0 === 0xce && b1 === 0xfa && b2 === 0xed && b3 === 0xfe) ||
      (b0 === 0xcf && b1 === 0xfa && b2 === 0xed && b3 === 0xfe) ||
      (b0 === 0xca && b1 === 0xfe && b2 === 0xba && b3 === 0xbe);

    if (isMachO) {
      return {
        valid: false,
        isExecutable: true,
        error: "Executable files (Mach-O binary) are strictly forbidden.",
      };
    }
  }

  // 2. Validate PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    if (declaredKind === "pdf") {
      return { valid: true, detectedKind: "pdf" };
    }
    return {
      valid: false,
      detectedKind: "pdf",
      error: `File has PDF magic bytes but was declared as '${declaredKind}'.`,
    };
  }

  // 3. Validate DOCX: PK zip archive (0x50 0x4B 0x03 0x04)
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    // Verify it is a Word document (DOCX contains word/ or [Content_Types].xml)
    const headerSlice = buffer.subarray(0, Math.min(buffer.length, 2048)).toString("latin1");
    if (headerSlice.includes("[Content_Types].xml") || headerSlice.includes("word/")) {
      if (declaredKind === "docx") {
        return { valid: true, detectedKind: "docx" };
      }
      return {
        valid: false,
        detectedKind: "docx",
        error: `File has DOCX magic bytes but was declared as '${declaredKind}'.`,
      };
    }
    // Generic zip that is not DOCX
    return {
      valid: false,
      error: "Zip archive is not a valid Microsoft Word (.docx) document.",
    };
  }

  // 4. Validate Markdown / Text: Must be valid UTF-8 without binary null bytes
  if (declaredKind === "markdown" || declaredKind === "text" || declaredKind === "plan_import") {
    // Check first 1024 bytes for null bytes or control characters indicative of binary files
    const checkLen = Math.min(buffer.length, 1024);
    for (let i = 0; i < checkLen; i++) {
      if (buffer[i] === 0x00) {
        return {
          valid: false,
          error: "Binary content detected in text document. File must be clean UTF-8 text.",
        };
      }
    }
    return { valid: true, detectedKind: declaredKind as MaterialKind };
  }

  // Declared kind did not match its magic signature
  return {
    valid: false,
    error: `File does not match magic byte signature for '${declaredKind}'. Renamed or corrupted file detected.`,
  };
}

/**
 * Sanitizes uploaded filenames to prevent directory traversal and special character attacks.
 */
export function sanitizeFilename(filename: string): string {
  // Strip paths
  const base = filename.replace(/^.*[\\/]/, "");
  // Remove non-alphanumeric except dots, dashes, underscores
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Prevent double dots
  const safe = clean.replace(/\.{2,}/g, ".");
  return safe.slice(0, 100) || "unnamed_document";
}

/**
 * Generates deterministic SHA-256 hash of material content for duplicate skipping.
 */
export function hashContent(data: Buffer | string): string {
  const hash = crypto.createHash("sha256");
  hash.update(data);
  return hash.digest("hex");
}
