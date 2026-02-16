import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import type { LocationConfig, WebcamSource } from "../src/types.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const LOCATIONS_DIR = path.join(ROOT, "data", "locations");

interface LocationSetup {
  snapshotFile: string;
  locationName: string;
  source: WebcamSource;
  landmarks: {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    threshold?: number;
  }[];
}

const locations: LocationSetup[] = [
  {
    snapshotFile: "salesforce-north.png",
    locationName: "salesforce-north",
    source: {
      type: "hls",
      url: "https://prope8aah39g.airspace-cdn.cbsivideo.com/weathercams/kpix-salesforce-3/s3-hls/master.m3u8",
    },
    landmarks: [
      // GG Bridge south tower — the prominent red tower left of center
      { name: "gg-bridge-south-tower", x: 400, y: 260, width: 80, height: 160 },
      // Marin Headlands — mountain ridge behind the bridge
      { name: "marin-headlands", x: 550, y: 250, width: 400, height: 100 },
      // Palace of Fine Arts — distinctive dome in Marina district
      { name: "palace-of-fine-arts", x: 100, y: 520, width: 200, height: 130 },
    ],
  },
  {
    snapshotFile: "markhopkins-northeast.png",
    locationName: "markhopkins-northeast",
    source: {
      type: "hls",
      url: "https://proped8eh466.airspace-cdn.cbsivideo.com/weathercams/kpix-mark-hopkins-rooftop-cam-2/s3-hls/master.m3u8",
    },
    landmarks: [
      // Transamerica Pyramid — tall pointed spire with red light
      { name: "transamerica-pyramid", x: 630, y: 60, width: 80, height: 360 },
      // Treasure Island / East Bay — distant shoreline across the bay
      { name: "treasure-island", x: 100, y: 270, width: 300, height: 120 },
    ],
  },
];

async function setup() {
  for (const loc of locations) {
    const snapshotPath = path.join(ROOT, "snapshots", loc.snapshotFile);
    const imageBuffer = await fs.readFile(snapshotPath);

    console.log(`Setting up ${loc.locationName} from ${loc.snapshotFile}...`);

    const locationTemplateDir = path.join(TEMPLATES_DIR, loc.locationName);
    await fs.mkdir(locationTemplateDir, { recursive: true });
    await fs.mkdir(LOCATIONS_DIR, { recursive: true });

    const config: LocationConfig = {
      location: loc.locationName,
      source: loc.source,
      landmarks: [],
    };

    for (const lm of loc.landmarks) {
      const templateFilename = `${lm.name}.png`;
      const templatePath = path.join(locationTemplateDir, templateFilename);

      await sharp(imageBuffer)
        .extract({ left: lm.x, top: lm.y, width: lm.width, height: lm.height })
        .png()
        .toFile(templatePath);

      config.landmarks.push({
        name: lm.name,
        templatePath: `templates/${loc.locationName}/${templateFilename}`,
        region: { x: lm.x, y: lm.y, width: lm.width, height: lm.height },
        threshold: lm.threshold ?? 0.7,
      });

      console.log(`  Created template: ${lm.name} (${lm.width}x${lm.height} at ${lm.x},${lm.y})`);
    }

    const configPath = path.join(LOCATIONS_DIR, `${loc.locationName}.json`);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log(`  Saved config: data/locations/${loc.locationName}.json`);
  }

  console.log("\nDone! Template files and location configs created.");
}

setup().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
