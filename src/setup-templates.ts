import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { fetchWebcamImage } from "./image-fetcher.js";
import type { LocationConfig, WebcamSource } from "./types.js";

const TEMPLATES_DIR = path.resolve(import.meta.dirname, "..", "templates");
const LOCATIONS_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "data",
  "locations"
);

interface TemplateSetup {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  threshold?: number;
}

/**
 * One-time setup: fetch a clear-day webcam image, crop landmark regions,
 * and save both the template images and a location config file.
 */
export async function createTemplateWithCoordinates(
  source: WebcamSource,
  location: string,
  landmarks: TemplateSetup[]
): Promise<void> {
  console.log(`Setting up templates for ${location}...`);

  // Fetch a clear-day webcam image (supports direct URLs and HLS streams)
  const imageBuffer = await fetchWebcamImage(source);

  // Create directories
  const locationTemplateDir = path.join(TEMPLATES_DIR, location);
  await fs.mkdir(locationTemplateDir, { recursive: true });
  await fs.mkdir(LOCATIONS_DIR, { recursive: true });

  const config: LocationConfig = {
    location,
    source,
    landmarks: [],
  };

  for (const landmark of landmarks) {
    const templateFilename = `${landmark.name}.png`;
    const templatePath = path.join(locationTemplateDir, templateFilename);

    // Extract and save the template image
    await sharp(imageBuffer)
      .extract({
        left: landmark.x,
        top: landmark.y,
        width: landmark.width,
        height: landmark.height,
      })
      .png()
      .toFile(templatePath);

    // Use relative path from project root for portability
    config.landmarks.push({
      name: landmark.name,
      templatePath: `./templates/${location}/${templateFilename}`,
      region: {
        x: landmark.x,
        y: landmark.y,
        width: landmark.width,
        height: landmark.height,
      },
      threshold: landmark.threshold ?? 0.7,
    });

    console.log(
      `  Created template for ${landmark.name} (${landmark.width}x${landmark.height} at ${landmark.x},${landmark.y})`
    );
  }

  // Save config file
  const configPath = path.join(LOCATIONS_DIR, `${location}.json`);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");

  console.log(`Saved config to data/locations/${location}.json`);
}

// When run directly, show usage instructions
console.log("Template setup module loaded.");
console.log("Usage: import { createTemplateWithCoordinates } from './setup-templates.js'");
console.log("Then call createTemplateWithCoordinates(source, location, landmarks)");
console.log("");
console.log("Examples:");
console.log(`  // Direct image URL
  await createTemplateWithCoordinates(
    { type: 'image', url: 'https://www.ocf.berkeley.edu/~thelawrence/images/newview.jpg' },
    'berkeley',
    [{ name: 'sf-skyline', x: 300, y: 200, width: 150, height: 100 }]
  );

  // HLS stream (Salesforce Tower)
  await createTemplateWithCoordinates(
    { type: 'hls', url: 'https://...airspace-cdn.cbsivideo.com/.../master.m3u8' },
    'salesforce-east',
    [{ name: 'bay-bridge-tower', x: 400, y: 300, width: 100, height: 150 }]
  );`);
