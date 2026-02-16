import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { WebcamSource } from "./types.js";

const execFileAsync = promisify(execFile);

// Use FFMPEG_PATH env var if set, otherwise try common locations
const FFMPEG_PATH =
  process.env.FFMPEG_PATH ||
  (process.platform === "darwin" ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg");

/**
 * Fetch a webcam image as a Buffer, supporting both direct image URLs
 * and HLS video streams (via ffmpeg snapshot).
 */
export async function fetchWebcamImage(source: WebcamSource): Promise<Buffer> {
  if (source.type === "image") {
    return fetchDirectImage(source.url);
  }
  return fetchHlsSnapshot(source.url);
}

/**
 * Fetch a direct image URL (JPG/PNG) via HTTP.
 */
async function fetchDirectImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Grab a single frame from an HLS stream using ffmpeg.
 * Outputs a PNG to stdout via pipe, avoiding temp files.
 */
async function fetchHlsSnapshot(url: string): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    FFMPEG_PATH,
    [
      "-i", url,
      "-frames:v", "1",
      "-f", "image2pipe",
      "-vcodec", "png",
      "pipe:1",
    ],
    {
      encoding: "buffer",
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      timeout: 30_000,
    }
  );
  if (!stdout || stdout.length === 0) {
    throw new Error(`ffmpeg returned empty output for ${url}`);
  }
  return stdout;
}
