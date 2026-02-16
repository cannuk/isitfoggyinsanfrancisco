import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { createImageWithRegion } from "./helpers.js";
import type { LocationConfig } from "../types.js";

// Mock the image fetcher
vi.mock("../image-fetcher.js", () => ({
  fetchWebcamImage: vi.fn(),
}));

import { createTemplateWithCoordinates } from "../setup-templates.js";
import { fetchWebcamImage } from "../image-fetcher.js";

const mockFetch = vi.mocked(fetchWebcamImage);

describe("createTemplateWithCoordinates", () => {
  let tmpDir: string;
  let origTemplatesDir: string;
  let origLocationsDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fog-setup-"));
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    // Clean up any remaining temp dirs
  });

  it("creates template images and config file", async () => {
    const testImage = await createImageWithRegion(
      400,
      300,
      { x: 50, y: 50, width: 80, height: 60 },
      { r: 128, g: 128, b: 128 },
      { r: 255, g: 0, b: 0 }
    );
    mockFetch.mockResolvedValue(testImage);

    // Monkey-patch the module's directory constants via a wrapper approach:
    // We'll call the function and check the outputs in the default locations,
    // but since the function uses resolved paths relative to import.meta.dirname,
    // we verify by checking the actual output paths.

    await createTemplateWithCoordinates(
      { type: "image", url: "https://example.com/cam.jpg" },
      "test-cam",
      [
        { name: "landmark-a", x: 50, y: 50, width: 80, height: 60 },
        { name: "landmark-b", x: 100, y: 100, width: 40, height: 30, threshold: 0.85 },
      ]
    );

    // Verify fetchWebcamImage was called with the right source
    expect(mockFetch).toHaveBeenCalledWith({
      type: "image",
      url: "https://example.com/cam.jpg",
    });

    // Verify template images were created
    const projectRoot = path.resolve(import.meta.dirname, "../..");
    const templateDir = path.join(projectRoot, "templates", "test-cam");
    const templateA = path.join(templateDir, "landmark-a.png");
    const templateB = path.join(templateDir, "landmark-b.png");

    const statA = await fs.stat(templateA);
    expect(statA.isFile()).toBe(true);

    const statB = await fs.stat(templateB);
    expect(statB.isFile()).toBe(true);

    // Verify template dimensions match the specified regions
    const metaA = await sharp(templateA).metadata();
    expect(metaA.width).toBe(80);
    expect(metaA.height).toBe(60);

    const metaB = await sharp(templateB).metadata();
    expect(metaB.width).toBe(40);
    expect(metaB.height).toBe(30);

    // Verify config file
    const configPath = path.join(projectRoot, "data", "locations", "test-cam.json");
    const configData = JSON.parse(await fs.readFile(configPath, "utf-8")) as LocationConfig;

    expect(configData.location).toBe("test-cam");
    expect(configData.source).toEqual({ type: "image", url: "https://example.com/cam.jpg" });
    expect(configData.landmarks).toHaveLength(2);

    // Check landmark A uses default threshold
    expect(configData.landmarks[0].name).toBe("landmark-a");
    expect(configData.landmarks[0].threshold).toBe(0.7);
    expect(configData.landmarks[0].region).toEqual({ x: 50, y: 50, width: 80, height: 60 });

    // Check landmark B uses custom threshold
    expect(configData.landmarks[1].name).toBe("landmark-b");
    expect(configData.landmarks[1].threshold).toBe(0.85);

    // Clean up generated files
    await fs.rm(templateDir, { recursive: true, force: true });
    await fs.rm(configPath, { force: true });
  });

  it("supports HLS source type", async () => {
    const testImage = await createImageWithRegion(
      200,
      200,
      { x: 10, y: 10, width: 50, height: 50 },
      { r: 50, g: 50, b: 50 },
      { r: 0, g: 255, b: 0 }
    );
    mockFetch.mockResolvedValue(testImage);

    await createTemplateWithCoordinates(
      { type: "hls", url: "https://example.com/stream.m3u8" },
      "test-hls-cam",
      [{ name: "green-spot", x: 10, y: 10, width: 50, height: 50 }]
    );

    expect(mockFetch).toHaveBeenCalledWith({
      type: "hls",
      url: "https://example.com/stream.m3u8",
    });

    // Verify config file stores the HLS source
    const projectRoot = path.resolve(import.meta.dirname, "../..");
    const configPath = path.join(projectRoot, "data", "locations", "test-hls-cam.json");
    const configData = JSON.parse(await fs.readFile(configPath, "utf-8")) as LocationConfig;
    expect(configData.source.type).toBe("hls");

    // Clean up
    await fs.rm(path.join(projectRoot, "templates", "test-hls-cam"), {
      recursive: true,
      force: true,
    });
    await fs.rm(configPath, { force: true });
  });
});
