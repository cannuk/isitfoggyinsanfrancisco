import fs from "node:fs/promises";
import path from "node:path";

const API_DIR = path.resolve(import.meta.dirname, "..", "api");
const HISTORY_DIR = path.join(API_DIR, "history");
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000; // 2 years in milliseconds

/**
 * Update the historical range metadata showing available data.
 */
async function updateHistoricalRange(): Promise<void> {
  try {
    const files = await fs.readdir(HISTORY_DIR);
    const dateFiles = files
      .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
      .sort();

    if (dateFiles.length === 0) {
      console.log("  No historical data files found");
      return;
    }

    const startDate = dateFiles[0];
    const endDate = dateFiles[dateFiles.length - 1];
    const totalDays = dateFiles.length;

    const rangeData = {
      startDate,
      endDate,
      totalDays,
      lastUpdated: new Date().toISOString(),
    };

    await fs.writeFile(
      path.join(HISTORY_DIR, "range"),
      JSON.stringify(rangeData, null, 2) + "\n"
    );
    console.log(`\n  Updated range: ${startDate} to ${endDate} (${totalDays} days)`);
  } catch (error) {
    console.error("  Failed to update historical range:", error);
  }
}

/**
 * Clean up historical data by removing files older than 2 years.
 * This job runs daily to maintain the rolling 2-year window.
 */
async function main(): Promise<void> {
  console.log("Starting history cleanup...");

  try {
    const files = await fs.readdir(HISTORY_DIR);
    const cutoffTime = Date.now() - TWO_YEARS_MS;
    const cutoffDate = new Date(cutoffTime).toISOString().split("T")[0];

    console.log(`  Cutoff date: ${cutoffDate} (2 years ago)`);

    let deletedCount = 0;
    let keptCount = 0;

    for (const file of files) {
      // Skip non-date files (like "recent")
      if (!/^\d{4}-\d{2}-\d{2}$/.test(file)) {
        console.log(`  Skipping non-date file: ${file}`);
        continue;
      }

      const fileDate = new Date(file);
      if (fileDate.getTime() < cutoffTime) {
        await fs.unlink(path.join(HISTORY_DIR, file));
        console.log(`  ✓ Deleted: ${file}`);
        deletedCount++;
      } else {
        keptCount++;
      }
    }

    console.log(`\nCleanup complete:`);
    console.log(`  Deleted: ${deletedCount} file(s)`);
    console.log(`  Kept: ${keptCount} file(s)`);

    // Update the range metadata if we deleted anything
    if (deletedCount > 0 || keptCount > 0) {
      await updateHistoricalRange();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log("  History directory does not exist yet. Nothing to clean up.");
    } else {
      throw error;
    }
  }
}

main().catch((error) => {
  console.error("Fatal error during cleanup:", error);
  process.exit(1);
});
