import fs from "node:fs/promises";
import path from "node:path";
import { analyzeFogLevel } from "./fog-detector.js";
import type { CurrentStatus, VisibilityResult } from "./types.js";

const LOCATIONS_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "data",
  "locations"
);
const API_DIR = path.resolve(import.meta.dirname, "..", "api");

/**
 * Main entry point: check fog conditions at all configured locations
 * and write results to the static API directory.
 */
async function main(): Promise<void> {
  // Find all configured locations
  const files = await fs.readdir(LOCATIONS_DIR);
  const locationFiles = files.filter(
    (f) => f.endsWith(".json") && f !== ".gitkeep"
  );

  if (locationFiles.length === 0) {
    console.log("No locations configured yet.");
    console.log("Run the setup script first to configure webcam locations.");
    return;
  }

  console.log(
    `Checking fog at ${locationFiles.length} location(s)...`
  );

  const results: VisibilityResult[] = [];

  for (const file of locationFiles) {
    const locationName = path.basename(file, ".json");
    try {
      console.log(`  Checking ${locationName}...`);
      const result = await analyzeFogLevel(locationName);
      results.push(result);
      console.log(
        `  ${locationName}: ${result.fogLevel} (${result.landmarksVisible}/${result.totalLandmarks} landmarks visible)`
      );
    } catch (error) {
      console.error(`  Failed to check ${locationName}:`, error);
    }
  }

  // Build current status API response
  const currentStatuses: CurrentStatus[] = results.map((r) => ({
    location: r.location,
    currentStatus: {
      fogLevel: r.fogLevel,
      visibilityScore: r.visibilityScore,
      timestamp: r.timestamp,
    },
    prediction: null, // Predictions will be added once we have historical data
  }));

  // Write API files
  await fs.mkdir(API_DIR, { recursive: true });
  await fs.writeFile(
    path.join(API_DIR, "current.json"),
    JSON.stringify(currentStatuses, null, 2) + "\n"
  );

  console.log(`\nResults written to api/current.json`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
