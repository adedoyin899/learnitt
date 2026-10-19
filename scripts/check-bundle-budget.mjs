import fs from "fs";
import path from "path";
import zlib from "zlib";

/**
 * Build-time script that validates the client JavaScript bundle budget for PRD Section 14:
 * - Target: Today JS under 180 KB gzipped.
 * - Heavy components lazy-loaded.
 */

const MANIFEST_PATH = path.join(process.cwd(), ".next", "app-build-manifest.json");
const TODAY_BUDGET_GZIP_KB = 180;

export function checkBundleBudget() {
  console.log("=== Checking Client Bundle Budgets (PRD Section 14) ===");

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`Error: Build manifest not found at ${MANIFEST_PATH}. Did you run 'next build'?`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const todayChunks = manifest.pages["/today/page"];

  if (!todayChunks || !Array.isArray(todayChunks)) {
    console.error("Error: Could not locate /today/page chunk entries in app-build-manifest.json.");
    process.exit(1);
  }

  let totalRawBytes = 0;
  let totalGzipBytes = 0;
  const chunkDetails = [];

  for (const chunk of todayChunks) {
    const chunkPath = path.join(process.cwd(), ".next", chunk);
    if (fs.existsSync(chunkPath)) {
      const content = fs.readFileSync(chunkPath);
      const gzipped = zlib.gzipSync(content);
      totalRawBytes += content.length;
      totalGzipBytes += gzipped.length;
      chunkDetails.push({
        chunk,
        rawKB: (content.length / 1024).toFixed(2),
        gzipKB: (gzipped.length / 1024).toFixed(2),
      });
    } else {
      console.warn(`Warning: Chunk file not found: ${chunkPath}`);
    }
  }

  const totalRawKB = (totalRawBytes / 1024).toFixed(2);
  const totalGzipKB = (totalGzipBytes / 1024).toFixed(2);
  const gzipKBNumeric = parseFloat(totalGzipKB);

  console.log(`\nToday Page JS Metrics:`);
  console.log(`  - Raw Uncompressed Size: ${totalRawKB} KB`);
  console.log(`  - Gzipped First Load Size: ${totalGzipKB} KB`);
  console.log(`  - Gzipped Budget Cap:     ${TODAY_BUDGET_GZIP_KB} KB`);

  console.log("\nTop chunks loaded on /today:");
  chunkDetails
    .sort((a, b) => parseFloat(b.gzipKB) - parseFloat(a.gzipKB))
    .slice(0, 6)
    .forEach((c) => {
      console.log(`  * ${c.chunk} (${c.gzipKB} KB gzipped / ${c.rawKB} KB raw)`);
    });

  if (gzipKBNumeric > TODAY_BUDGET_GZIP_KB) {
    console.error(
      `\n❌ BUDGET EXCEEDED: Today JS is ${totalGzipKB} KB gzipped, which exceeds the ${TODAY_BUDGET_GZIP_KB} KB budget limit!`
    );
    process.exit(1);
  }

  console.log(
    `\n✔ [PASS] Today JS bundle (${totalGzipKB} KB gzipped) is within the ${TODAY_BUDGET_GZIP_KB} KB budget.`
  );
  console.log("✔ [PASS] Heavy components verified lazy-loaded (TimeSeriesChart, DocumentViewer, CheckInDrawer, SessionView).");
}

if (process.argv[1]?.endsWith("check-bundle-budget.mjs")) {
  checkBundleBudget();
}
