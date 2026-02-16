import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fetchWebcamImage } from "./image-fetcher.js";
import type {
  FogLevel,
  LandmarkTemplate,
  LocationConfig,
  VisibilityResult,
} from "./types.js";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data", "locations");

/**
 * Compare a specific region of a live webcam image against a stored template.
 * Both images are converted to grayscale and normalized to reduce sensitivity
 * to lighting changes throughout the day.
 */
export async function checkLandmarkVisibility(
  webcamBuffer: Buffer,
  landmark: LandmarkTemplate
): Promise<{ visible: boolean; similarity: number }> {
  const { x, y, width, height } = landmark.region;

  // Extract the landmark region from the live webcam image
  const webcamRegionPng = await sharp(webcamBuffer)
    .extract({ left: x, top: y, width, height })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();

  // Load and process the stored template the same way
  // Resolve template path: if absolute, use as-is; otherwise resolve relative to project root
  const absoluteTemplatePath = path.isAbsolute(landmark.templatePath)
    ? landmark.templatePath
    : path.join(PROJECT_ROOT, landmark.templatePath);
  const templatePng = await sharp(absoluteTemplatePath)
    .grayscale()
    .normalize()
    .png()
    .toBuffer();

  // Decode both as PNG for pixelmatch
  const webcamImg = PNG.sync.read(webcamRegionPng);
  const templateImg = PNG.sync.read(templatePng);

  const diff = pixelmatch(
    webcamImg.data,
    templateImg.data,
    undefined,
    width,
    height,
    { threshold: 0.1 }
  );

  const totalPixels = width * height;
  const similarity = 1 - diff / totalPixels;

  return {
    visible: similarity >= landmark.threshold,
    similarity: Math.round(similarity * 100) / 100,
  };
}

/**
 * Map a visibility score (0-100) to a fog level category.
 */
export function getFogLevel(score: number): FogLevel {
  if (score >= 80) return "clear";
  if (score >= 50) return "light";
  if (score >= 20) return "moderate";
  return "heavy";
}

/**
 * Fetch a webcam image and analyze fog conditions by checking each
 * configured landmark against its clear-day template.
 */
export async function analyzeFogLevel(
  locationName: string
): Promise<VisibilityResult> {
  const configPath = path.join(DATA_DIR, `${locationName}.json`);
  const configData = await fs.readFile(configPath, "utf-8");
  const config: LocationConfig = JSON.parse(configData);

  // Fetch current webcam image (supports both direct URLs and HLS streams)
  const webcamBuffer = await fetchWebcamImage(config.source);

  // Check each landmark at its stored pixel coordinates
  let visibleCount = 0;
  const landmarkDetails = [];

  for (const landmark of config.landmarks) {
    const result = await checkLandmarkVisibility(webcamBuffer, landmark);
    if (result.visible) visibleCount++;
    landmarkDetails.push({
      name: landmark.name,
      visible: result.visible,
      similarity: result.similarity,
    });
  }

  const visibilityScore = (visibleCount / config.landmarks.length) * 100;

  return {
    location: config.location,
    landmarksVisible: visibleCount,
    totalLandmarks: config.landmarks.length,
    visibilityScore: Math.round(visibilityScore),
    fogLevel: getFogLevel(visibilityScore),
    timestamp: new Date().toISOString(),
    landmarkDetails,
  };
}
