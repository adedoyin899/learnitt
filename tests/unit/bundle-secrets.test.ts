import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { scanDirectoryForSecrets } from "@/../scripts/check-bundle-secrets.mjs";

describe("Client Bundle Secret Leak Protection (scripts/check-bundle-secrets.mjs)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "learnitt-bundle-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("passes cleanly when no secret strings exist in bundle files", () => {
    const cleanFile = path.join(tempDir, "main-app.js");
    fs.writeFileSync(cleanFile, 'console.log("Welcome to Learnitt");');

    const violations = scanDirectoryForSecrets(tempDir, [
      "SUPABASE_SERVICE_ROLE_KEY",
      "PLANTED_SECRET_SERVICE_ROLE_LEAK_TEST",
    ]);

    expect(violations).toHaveLength(0);
  });

  it("catches a planted secret string and returns violations", () => {
    const leakedFile = path.join(tempDir, "client-chunk.js");
    fs.writeFileSync(
      leakedFile,
      'const secret = "PLANTED_SECRET_SERVICE_ROLE_LEAK_TEST"; console.log(secret);'
    );

    const violations = scanDirectoryForSecrets(tempDir, [
      "SUPABASE_SERVICE_ROLE_KEY",
      "PLANTED_SECRET_SERVICE_ROLE_LEAK_TEST",
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0].pattern).toBe("PLANTED_SECRET_SERVICE_ROLE_LEAK_TEST");
    expect(violations[0].file).toBe(leakedFile);
  });

  it("catches direct reference to SUPABASE_SERVICE_ROLE_KEY identifier", () => {
    const leakedFile = path.join(tempDir, "auth-client.js");
    fs.writeFileSync(
      leakedFile,
      'export const key = process.env.SUPABASE_SERVICE_ROLE_KEY;'
    );

    const violations = scanDirectoryForSecrets(tempDir, [
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0].pattern).toBe("SUPABASE_SERVICE_ROLE_KEY");
  });
});
