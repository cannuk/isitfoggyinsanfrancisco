import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { createSolidPng, createImageWithRegion } from "./helpers.js";
import { checkLandmarkVisibility } from "../fog-detector.js";
import type { LandmarkTemplate } from "../types.js";

describe("checkLandmarkVisibility", () => {
  let tmpDir: string;
  let templatePath: string;
  const region = { x: 50, y: 50, width: 100, height: 100 };

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fog-test-"));

    // Create a template: a solid red 100x100 PNG
    const templateBuffer = await createSolidPng(100, 100, { r: 255, g: 0, b: 0 });
    templatePath = path.join(tmpDir, "template.png");
    await fs.writeFile(templatePath, templateBuffer);
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns high similarity when webcam region matches template", async () => {
    // Create a webcam image with the same red region at the expected coordinates
    const webcamBuffer = await createImageWithRegion(
      300,
      300,
      region,
      { r: 100, g: 100, b: 100 }, // grey background
      { r: 255, g: 0, b: 0 } // red region (matches template)
    );

    const landmark: LandmarkTemplate = {
      name: "test-landmark",
      templatePath,
      region,
      threshold: 0.7,
    };

    const result = await checkLandmarkVisibility(webcamBuffer, landmark);

    expect(result.visible).toBe(true);
    expect(result.similarity).toBeGreaterThanOrEqual(0.7);
  });

  it("returns low similarity when webcam region differs from template", async () => {
    // Create a webcam image with a BLUE region instead of red
    const webcamBuffer = await createImageWithRegion(
      300,
      300,
      region,
      { r: 100, g: 100, b: 100 },
      { r: 0, g: 0, b: 255 } // blue region (doesn't match red template)
    );

    const landmark: LandmarkTemplate = {
      name: "test-landmark",
      templatePath,
      region,
      threshold: 0.7,
    };

    const result = await checkLandmarkVisibility(webcamBuffer, landmark);

    expect(result.visible).toBe(false);
    expect(result.similarity).toBeLessThan(0.7);
  });

  it("respects the threshold parameter", async () => {
    // A non-matching image (blue vs red template) produces similarity ≈ 0.
    // With threshold=0, visible should be true (0 >= 0).
    // With threshold=0.01, visible should be false (0 < 0.01).
    const webcamBuffer = await createImageWithRegion(
      300,
      300,
      region,
      { r: 100, g: 100, b: 100 },
      { r: 0, g: 0, b: 255 } // blue — doesn't match red template
    );

    const zeroThreshold: LandmarkTemplate = {
      name: "test-landmark",
      templatePath,
      region,
      threshold: 0, // accepts any similarity including 0
    };

    const lowThreshold: LandmarkTemplate = {
      name: "test-landmark",
      templatePath,
      region,
      threshold: 0.01, // requires at least some match
    };

    const zeroResult = await checkLandmarkVisibility(webcamBuffer, zeroThreshold);
    const lowResult = await checkLandmarkVisibility(webcamBuffer, lowThreshold);

    // Both produce the same similarity, but threshold changes visibility
    expect(zeroResult.similarity).toBe(lowResult.similarity);
    expect(zeroResult.visible).toBe(true);
    expect(lowResult.visible).toBe(false);
  });
});

describe("analyzeFogLevel", () => {
  it("returns correct VisibilityResult structure", async () => {
    // This test uses mocking to avoid needing real webcam data
    const { analyzeFogLevel } = await import("../fog-detector.js");

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fog-analyze-"));
    const templateBuffer = await createSolidPng(50, 50, { r: 255, g: 0, b: 0 });
    const templatePath = path.join(tmpDir, "landmark.png");
    await fs.writeFile(templatePath, templateBuffer);

    // Create a matching webcam image
    const webcamImage = await createImageWithRegion(
      200,
      200,
      { x: 10, y: 10, width: 50, height: 50 },
      { r: 100, g: 100, b: 100 },
      { r: 255, g: 0, b: 0 }
    );

    // Create a config file
    const config = {
      location: "test-location",
      source: { type: "image", url: "https://example.com/cam.jpg" },
      landmarks: [
        {
          name: "test-landmark",
          templatePath,
          region: { x: 10, y: 10, width: 50, height: 50 },
          threshold: 0.5,
        },
      ],
    };
    const configPath = path.join(tmpDir, "test-location.json");
    await fs.writeFile(configPath, JSON.stringify(config));

    // Mock the image fetcher and file path
    const imageFetcher = await import("../image-fetcher.js");
    vi.spyOn(imageFetcher, "fetchWebcamImage").mockResolvedValue(webcamImage);

    // We need to mock the DATA_DIR — the simplest way is to mock fs.readFile
    // for the specific call analyzeFogLevel makes
    const originalReadFile = fs.readFile;
    vi.spyOn(fs, "readFile").mockImplementation(async (filePath, ...args) => {
      if (typeof filePath === "string" && filePath.includes("test-location.json")) {
        return JSON.stringify(config);
      }
      return originalReadFile(filePath, ...args);
    });

    const result = await analyzeFogLevel("test-location");

    expect(result).toMatchObject({
      location: "test-location",
      totalLandmarks: 1,
      fogLevel: expect.stringMatching(/^(clear|light|moderate|heavy)$/),
    });
    expect(result.visibilityScore).toBeGreaterThanOrEqual(0);
    expect(result.visibilityScore).toBeLessThanOrEqual(100);
    expect(result.landmarkDetails).toHaveLength(1);
    expect(result.landmarkDetails[0].name).toBe("test-landmark");
    expect(result.timestamp).toBeTruthy();

    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
