import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { HistoricalData, HistoricalReading } from "./types.js";

const API_DIR = path.resolve(import.meta.dirname, "..", "api");
const HISTORY_DIR = path.join(API_DIR, "history");

interface CommitInfo {
  hash: string;
  timestamp: string;
  message: string;
}

/**
 * Get all commits that updated API files with fog condition data.
 */
function getApiCommits(): CommitInfo[] {
  const output = execSync(
    'git log --all --format="%H|%aI|%s" -- api/',
    { encoding: "utf-8" }
  );

  return output
    .trim()
    .split("\n")
    .filter((line) => line.includes("Update fog conditions"))
    .map((line) => {
      const [hash, timestamp, ...messageParts] = line.split("|");
      return {
        hash,
        timestamp,
        message: messageParts.join("|"),
      };
    });
}

/**
 * Get file content from a specific commit.
 */
function getFileAtCommit(commit: string, filePath: string): string | null {
  try {
    return execSync(`git show ${commit}:${filePath}`, {
      encoding: "utf-8",
    });
  } catch (error) {
    return null;
  }
}

/**
 * Extract historical data from git commits and create daily files.
 */
async function extractHistoricalData(): Promise<void> {
  console.log("Extracting historical data from git commits...\n");

  const commits = getApiCommits();
  console.log(`Found ${commits.length} fog condition commits`);

  // Group readings by date
  const dailyReadings = new Map<
    string,
    Map<number, HistoricalReading>
  >();

  for (const commit of commits) {
    const date = new Date(commit.timestamp);
    const dateString = date.toISOString().split("T")[0]; // YYYY-MM-DD
    const hour = date.getUTCHours();

    // Get the 'all' file content (has all regions)
    const allContent = getFileAtCommit(commit.hash, "api/all");
    if (!allContent) continue;

    try {
      const data = JSON.parse(allContent);

      // Build reading from the data
      const reading: HistoricalReading = {
        timestamp: commit.timestamp,
        regions: {},
      };

      // Data is an array of regions
      for (const region of data) {
        reading.regions[region.region] = {
          fogLevel: region.fogLevel,
          visibilityScore: region.visibilityScore,
          landmarksVisible: region.landmarks.filter((l: any) => l.visible)
            .length,
          totalLandmarks: region.landmarks.length,
        };
      }

      // Store in map
      if (!dailyReadings.has(dateString)) {
        dailyReadings.set(dateString, new Map());
      }
      dailyReadings.get(dateString)!.set(hour, reading);
    } catch (error) {
      console.error(`  Failed to parse commit ${commit.hash.slice(0, 7)}`);
    }
  }

  console.log(`\nProcessed ${dailyReadings.size} unique days`);

  // Create history directory
  await fs.mkdir(HISTORY_DIR, { recursive: true });

  // Write daily files
  for (const [dateString, hours] of dailyReadings.entries()) {
    const dailyData: HistoricalData = {
      hours: Array(24).fill(null),
    };

    // Fill in the hours we have data for
    for (const [hour, reading] of hours.entries()) {
      dailyData.hours[hour] = reading;
    }

    const filePath = path.join(HISTORY_DIR, dateString);
    await fs.writeFile(filePath, JSON.stringify(dailyData, null, 2) + "\n");

    const readingCount = hours.size;
    console.log(`  ✓ ${dateString}: ${readingCount} hours`);
  }

  console.log(`\n✓ Created ${dailyReadings.size} historical data files`);
}

/**
 * Update the historical range metadata.
 */
async function updateHistoricalRange(): Promise<void> {
  const files = await fs.readdir(HISTORY_DIR);
  const dateFiles = files
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
    .sort();

  if (dateFiles.length === 0) {
    console.log("No historical data files found");
    return;
  }

  const rangeData = {
    startDate: dateFiles[0],
    endDate: dateFiles[dateFiles.length - 1],
    totalDays: dateFiles.length,
    lastUpdated: new Date().toISOString(),
  };

  await fs.writeFile(
    path.join(HISTORY_DIR, "index"),
    JSON.stringify(rangeData, null, 2) + "\n"
  );

  console.log(
    `\n✓ Created history index: ${rangeData.startDate} to ${rangeData.endDate}`
  );
}

async function main(): Promise<void> {
  console.log("Git History Extraction");
  console.log("======================\n");

  await extractHistoricalData();
  await updateHistoricalRange();

  console.log("\n✓ Historical data extraction complete!");
}

main().catch((error) => {
  console.error("Extraction failed:", error);
  process.exit(1);
});
