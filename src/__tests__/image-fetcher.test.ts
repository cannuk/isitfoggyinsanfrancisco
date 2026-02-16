import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSolidPng } from "./helpers.js";

// Create the mock for the promisified execFile before module loading.
// Node's real execFile has a [Symbol for util.promisify.custom] property,
// so when promisify() is called on our mock, it picks up this custom version.
const mockExecFileAsync = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => {
  const fn = vi.fn();
  const customSymbol = Symbol.for("nodejs.util.promisify.custom");
  (fn as any)[customSymbol] = mockExecFileAsync;
  return { execFile: fn };
});

import { fetchWebcamImage } from "../image-fetcher.js";

describe("fetchWebcamImage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("type: image", () => {
    it("fetches and returns the image buffer", async () => {
      const testPng = await createSolidPng(10, 10, { r: 255, g: 0, b: 0 });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(testPng.buffer),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await fetchWebcamImage({
        type: "image",
        url: "https://example.com/cam.jpg",
      });

      expect(mockFetch).toHaveBeenCalledWith("https://example.com/cam.jpg");
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it("throws on non-200 response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: "Not Found",
        })
      );

      await expect(
        fetchWebcamImage({ type: "image", url: "https://example.com/missing.jpg" })
      ).rejects.toThrow("Failed to fetch image: 404 Not Found");
    });
  });

  describe("type: hls", () => {
    it("calls ffmpeg and returns the stdout buffer", async () => {
      const testPng = await createSolidPng(10, 10, { r: 0, g: 255, b: 0 });

      // mockExecFileAsync is the custom promisify implementation,
      // so it should resolve to { stdout, stderr }
      mockExecFileAsync.mockResolvedValue({
        stdout: testPng,
        stderr: Buffer.alloc(0),
      });

      const result = await fetchWebcamImage({
        type: "hls",
        url: "https://example.com/stream.m3u8",
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        expect.stringContaining("ffmpeg"), // Can be "ffmpeg" or "/path/to/ffmpeg"
        expect.arrayContaining(["-i", "https://example.com/stream.m3u8"]),
        expect.objectContaining({ encoding: "buffer" })
      );
    });

    it("throws when ffmpeg returns empty output", async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
      });

      await expect(
        fetchWebcamImage({ type: "hls", url: "https://example.com/stream.m3u8" })
      ).rejects.toThrow("ffmpeg returned empty output");
    });

    it("propagates ffmpeg errors", async () => {
      mockExecFileAsync.mockRejectedValue(new Error("ffmpeg crashed"));

      await expect(
        fetchWebcamImage({ type: "hls", url: "https://example.com/stream.m3u8" })
      ).rejects.toThrow("ffmpeg crashed");
    });
  });
});
