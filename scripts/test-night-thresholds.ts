import fs from "node:fs/promises";
import { checkLandmarkVisibility } from "../src/fog-detector.js";
import type { LocationConfig } from "../src/types.js";

async function test() {
  // Load current nighttime images
  const sfnCurrent = await fs.readFile("snapshots/current-salesforce-north.png");
  const mhneCurrent = await fs.readFile("snapshots/current-markhopkins-ne.png");

  // Load configs
  const sfnConfig: LocationConfig = JSON.parse(
    await fs.readFile("data/locations/salesforce-north.json", "utf-8")
  );
  const mhneConfig: LocationConfig = JSON.parse(
    await fs.readFile("data/locations/markhopkins-northeast.json", "utf-8")
  );

  console.log("=== SALESFORCE NORTH (nighttime vs daytime template) ===\n");
  for (const landmark of sfnConfig.landmarks) {
    const result = await checkLandmarkVisibility(sfnCurrent, landmark);
    console.log(`${landmark.name}:`);
    console.log(`  Similarity: ${result.similarity} (threshold: ${landmark.threshold})`);
    console.log(`  Visible: ${result.visible ? "✅ YES" : "❌ NO"}`);
    console.log();
  }

  console.log("\n=== MARK HOPKINS NORTHEAST (nighttime vs daytime template) ===\n");
  for (const landmark of mhneConfig.landmarks) {
    const result = await checkLandmarkVisibility(mhneCurrent, landmark);
    console.log(`${landmark.name}:`);
    console.log(`  Similarity: ${result.similarity} (threshold: ${landmark.threshold})`);
    console.log(`  Visible: ${result.visible ? "✅ YES" : "❌ NO"}`);
    console.log();
  }
}

test().catch(console.error);
