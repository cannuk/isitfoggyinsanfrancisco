import fs from "node:fs/promises";
import path from "node:path";
import { analyzeFogLevel } from "./fog-detector.js";
import type { VisibilityResult } from "./types.js";

const LOCATIONS_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "data",
  "locations"
);
const API_DIR = path.resolve(import.meta.dirname, "..", "api");

interface RegionStatus {
  region: string;
  fogLevel: string;
  visibilityScore: number;
  timestamp: string;
  landmarks: {
    name: string;
    visible: boolean;
    similarity: number;
  }[];
}

/**
 * Main entry point: check fog conditions at all configured locations
 * and write results to region-based API endpoints.
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

  // Group results by region
  const regionMap = new Map<string, VisibilityResult>();
  for (const result of results) {
    regionMap.set(result.region, result);
  }

  // Create API directory
  await fs.mkdir(API_DIR, { recursive: true });

  // Write region-specific endpoints (no .json extension)
  for (const [region, result] of regionMap.entries()) {
    const regionStatus: RegionStatus = {
      region,
      fogLevel: result.fogLevel,
      visibilityScore: result.visibilityScore,
      timestamp: result.timestamp,
      landmarks: result.landmarkDetails,
    };

    await fs.writeFile(
      path.join(API_DIR, region),
      JSON.stringify(regionStatus, null, 2) + "\n"
    );
    console.log(`  Wrote api/${region}`);
  }

  // Write combined /all endpoint
  const allRegions = Array.from(regionMap.values()).map((result) => ({
    region: result.region,
    fogLevel: result.fogLevel,
    visibilityScore: result.visibilityScore,
    timestamp: result.timestamp,
    landmarks: result.landmarkDetails,
  }));

  await fs.writeFile(
    path.join(API_DIR, "all"),
    JSON.stringify(allRegions, null, 2) + "\n"
  );
  console.log(`  Wrote api/all`);

  console.log(`\nAPI endpoints updated successfully`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
