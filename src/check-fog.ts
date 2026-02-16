import fs from "node:fs/promises";
import path from "node:path";
import { analyzeFogLevel } from "./fog-detector.js";
import type {
  VisibilityResult,
  HistoricalData,
  HistoricalReading,
} from "./types.js";

const LOCATIONS_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "data",
  "locations"
);
const API_DIR = path.resolve(import.meta.dirname, "..", "api");
const HISTORY_DIR = path.join(API_DIR, "history");
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

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
 * Update historical data with new reading, maintaining daily files and a 2-year rolling window.
 */
async function updateHistoricalData(
  results: VisibilityResult[]
): Promise<void> {
  // Create history directory
  await fs.mkdir(HISTORY_DIR, { recursive: true });

  // Create new reading from current results
  const timestamp = results[0]?.timestamp || new Date().toISOString();
  const readingDate = new Date(timestamp);
  const dateString = readingDate.toISOString().split("T")[0]; // YYYY-MM-DD

  const newReading: HistoricalReading = {
    timestamp,
    regions: {},
  };

  for (const result of results) {
    newReading.regions[result.region] = {
      fogLevel: result.fogLevel,
      visibilityScore: result.visibilityScore,
      landmarksVisible: result.landmarksVisible,
      totalLandmarks: result.totalLandmarks,
    };
  }

  // Read existing daily file or create 24-hour array
  const dailyFile = path.join(HISTORY_DIR, dateString);
  let dailyData: HistoricalData = { hours: Array(24).fill(null) };
  try {
    const existing = await fs.readFile(dailyFile, "utf-8");
    dailyData = JSON.parse(existing);
  } catch (error) {
    // File doesn't exist yet, start fresh with 24-item array
  }

  // Insert reading at the correct hour index (0-23)
  const hour = readingDate.getUTCHours();
  dailyData.hours[hour] = newReading;

  // Write updated daily file
  await fs.writeFile(
    dailyFile,
    JSON.stringify(dailyData, null, 2) + "\n"
  );
  console.log(`  Wrote api/history/${dateString}`);

  // Generate "recent" file with last 7 days
  await generateRecentFile();

  // Update historical range metadata
  await updateHistoricalRange();
}

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
      path.join(HISTORY_DIR, "index"),
      JSON.stringify(rangeData, null, 2) + "\n"
    );
    console.log(`  Wrote api/history (${startDate} to ${endDate})`);
  } catch (error) {
    console.error("  Failed to update historical range:", error);
  }
}

/**
 * Generate a "recent" file with the last 7 days of readings.
 */
async function generateRecentFile(): Promise<void> {
  try {
    const files = await fs.readdir(HISTORY_DIR);
    const cutoffTime = Date.now() - SEVEN_DAYS_MS;

    // Get all daily files from last 7 days
    const recentFiles = files
      .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
      .filter((f) => new Date(f).getTime() >= cutoffTime)
      .sort();

    // Combine all readings from these files, filtering out nulls
    const allReadings: HistoricalReading[] = [];
    for (const file of recentFiles) {
      const filePath = path.join(HISTORY_DIR, file);
      const content = await fs.readFile(filePath, "utf-8");
      const data: HistoricalData = JSON.parse(content);
      // Filter out null entries (hours with no data)
      const validReadings = data.hours.filter(
        (r): r is HistoricalReading => r !== null
      );
      allReadings.push(...validReadings);
    }

    // Sort by timestamp
    allReadings.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Write recent file
    const recentFile = path.join(HISTORY_DIR, "recent");
    await fs.writeFile(
      recentFile,
      JSON.stringify({ readings: allReadings }, null, 2) + "\n"
    );
    console.log(`  Wrote api/history/recent (${allReadings.length} readings)`);
  } catch (error) {
    console.error("  Failed to generate recent file:", error);
  }
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

  // Create regions directory
  const regionsDir = path.join(API_DIR, "regions");
  await fs.mkdir(regionsDir, { recursive: true });

  // Write individual region endpoints
  for (const [region, result] of regionMap.entries()) {
    const regionStatus: RegionStatus = {
      region,
      fogLevel: result.fogLevel,
      visibilityScore: result.visibilityScore,
      timestamp: result.timestamp,
      landmarks: result.landmarkDetails,
    };

    await fs.writeFile(
      path.join(regionsDir, region),
      JSON.stringify(regionStatus, null, 2) + "\n"
    );
    console.log(`  Wrote api/regions/${region}`);
  }

  // Write collection endpoint - all regions
  const allRegions = Array.from(regionMap.values()).map((result) => ({
    region: result.region,
    fogLevel: result.fogLevel,
    visibilityScore: result.visibilityScore,
    timestamp: result.timestamp,
    landmarks: result.landmarkDetails,
  }));

  await fs.writeFile(
    path.join(regionsDir, "index"),
    JSON.stringify(allRegions, null, 2) + "\n"
  );
  console.log(`  Wrote api/regions (collection)`);

  // Update historical data
  await updateHistoricalData(results);

  console.log(`\nAPI endpoints updated successfully`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
