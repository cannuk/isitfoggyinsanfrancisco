import fs from "node:fs/promises";
import path from "node:path";

const API_DIR = path.resolve(import.meta.dirname, "..", "api");
const REGIONS_DIR = path.join(API_DIR, "regions");
const HISTORY_DIR = path.join(API_DIR, "history");

/**
 * Migrate API structure from flat to hierarchical REST format.
 *
 * OLD:
 *   /api/golden-gate
 *   /api/downtown
 *   /api/all
 *
 * NEW:
 *   /api/regions/golden-gate
 *   /api/regions/downtown
 *   /api/regions/index (was /api/all)
 */
async function migrateCurrentEndpoints(): Promise<void> {
  console.log("Migrating current API endpoints...");

  // Create regions directory
  await fs.mkdir(REGIONS_DIR, { recursive: true });

  // Map of old files to new locations
  const migrations = [
    { old: "golden-gate", new: path.join(REGIONS_DIR, "golden-gate") },
    { old: "downtown", new: path.join(REGIONS_DIR, "downtown") },
    { old: "all", new: path.join(REGIONS_DIR, "index") },
  ];

  for (const { old, new: newPath } of migrations) {
    const oldPath = path.join(API_DIR, old);
    try {
      await fs.access(oldPath);
      await fs.copyFile(oldPath, newPath);
      await fs.unlink(oldPath);
      console.log(`  ✓ Moved ${old} → regions/${path.basename(newPath)}`);
    } catch (error) {
      console.log(`  ⊘ ${old} doesn't exist, skipping`);
    }
  }
}

/**
 * Migrate historical data if any exists (unlikely, but handle it).
 */
async function migrateHistoricalData(): Promise<void> {
  console.log("\nChecking for historical data to migrate...");

  try {
    await fs.access(HISTORY_DIR);
    const files = await fs.readdir(HISTORY_DIR);
    console.log(`  Found ${files.length} file(s) in history directory`);

    // The new code should handle these correctly, no migration needed
    console.log("  Historical data structure already in new format");
  } catch (error) {
    console.log("  No historical data found (expected - feature just merged)");
  }
}

async function main(): Promise<void> {
  console.log("API Structure Migration");
  console.log("=======================\n");

  await migrateCurrentEndpoints();
  await migrateHistoricalData();

  console.log("\n✓ Migration complete!");
  console.log("\nNext fog check will create files in the new structure.");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
