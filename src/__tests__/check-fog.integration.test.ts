import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { createSolidPng, createImageWithRegion } from "./helpers.js";
import type { LocationConfig, CurrentStatus } from "../types.js";

// Mock image fetcher globally
vi.mock("../image-fetcher.js", () => ({
  fetchWebcamImage: vi.fn(),
}));

import { fetchWebcamImage } from "../image-fetcher.js";
import { analyzeFogLevel } from "../fog-detector.js";

const mockFetch = vi.mocked(fetchWebcamImage);

describe("check-fog integration", () => {
  const region = { x: 20, y: 20, width: 60, height: 60 };
  let tmpDir: string;
  let templatePath: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fog-integration-"));

    // Create a template image
    const templateBuffer = await createSolidPng(60, 60, { r: 255, g: 0, b: 0 });
    templatePath = path.join(tmpDir, "landmark.png");
    await fs.writeFile(templatePath, templateBuffer);
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("detects clear conditions when landmarks match", async () => {
    // Webcam image where the landmark region matches the template
    const webcamImage = await createImageWithRegion(
      200,
      200,
      region,
      { r: 100, g: 100, b: 100 },
      { r: 255, g: 0, b: 0 } // red — matches template
    );
    mockFetch.mockResolvedValue(webcamImage);

    // Create config
    const config: LocationConfig = {
      location: "integration-test",
      source: { type: "image", url: "https://example.com/cam.jpg" },
      landmarks: [
        {
          name: "red-landmark",
          templatePath,
          region,
          threshold: 0.5,
        },
      ],
    };

    // Write config where analyzeFogLevel can find it
    const locationsDir = path.resolve(import.meta.dirname, "..", "..", "data", "locations");
    const configPath = path.join(locationsDir, "integration-test.json");
    await fs.mkdir(locationsDir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config));

    const result = await analyzeFogLevel("integration-test");

    expect(result.location).toBe("integration-test");
    expect(result.landmarksVisible).toBe(1);
    expect(result.totalLandmarks).toBe(1);
    expect(result.visibilityScore).toBe(100);
    expect(result.fogLevel).toBe("clear");
    expect(result.landmarkDetails[0].visible).toBe(true);

    // Clean up
    await fs.rm(configPath, { force: true });
  });

  it("detects heavy fog when landmarks are obscured", async () => {
    // Webcam image where everything is grey (fog)
    const foggyImage = await createSolidPng(200, 200, { r: 180, g: 180, b: 180 });
    mockFetch.mockResolvedValue(foggyImage);

    const config: LocationConfig = {
      location: "foggy-test",
      source: { type: "image", url: "https://example.com/cam.jpg" },
      landmarks: [
        {
          name: "red-landmark",
          templatePath,
          region,
          threshold: 0.7,
        },
      ],
    };

    const locationsDir = path.resolve(import.meta.dirname, "..", "..", "data", "locations");
    const configPath = path.join(locationsDir, "foggy-test.json");
    await fs.writeFile(configPath, JSON.stringify(config));

    const result = await analyzeFogLevel("foggy-test");

    expect(result.location).toBe("foggy-test");
    expect(result.landmarksVisible).toBe(0);
    expect(result.visibilityScore).toBe(0);
    expect(result.fogLevel).toBe("heavy");
    expect(result.landmarkDetails[0].visible).toBe(false);

    // Clean up
    await fs.rm(configPath, { force: true });
  });

  it("produces valid CurrentStatus JSON structure", async () => {
    const webcamImage = await createImageWithRegion(
      200,
      200,
      region,
      { r: 100, g: 100, b: 100 },
      { r: 255, g: 0, b: 0 }
    );
    mockFetch.mockResolvedValue(webcamImage);

    const config: LocationConfig = {
      location: "json-test",
      source: { type: "image", url: "https://example.com/cam.jpg" },
      landmarks: [
        {
          name: "red-landmark",
          templatePath,
          region,
          threshold: 0.5,
        },
      ],
    };

    const locationsDir = path.resolve(import.meta.dirname, "..", "..", "data", "locations");
    const configPath = path.join(locationsDir, "json-test.json");
    await fs.writeFile(configPath, JSON.stringify(config));

    const result = await analyzeFogLevel("json-test");

    // Build the CurrentStatus like check-fog.ts does
    const status: CurrentStatus = {
      location: result.location,
      currentStatus: {
        fogLevel: result.fogLevel,
        visibilityScore: result.visibilityScore,
        timestamp: result.timestamp,
      },
      prediction: null,
    };

    // Validate structure
    expect(status.location).toBe("json-test");
    expect(status.currentStatus.fogLevel).toMatch(/^(clear|light|moderate|heavy)$/);
    expect(typeof status.currentStatus.visibilityScore).toBe("number");
    expect(new Date(status.currentStatus.timestamp).getTime()).not.toBeNaN();
    expect(status.prediction).toBeNull();

    // Verify it serializes to valid JSON
    const json = JSON.stringify([status], null, 2);
    const parsed = JSON.parse(json) as CurrentStatus[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].location).toBe("json-test");

    // Clean up
    await fs.rm(configPath, { force: true });
  });
});
