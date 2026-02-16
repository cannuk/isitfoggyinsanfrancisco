import sharp from "sharp";

/**
 * Generate a solid-color PNG buffer of the given dimensions.
 */
export async function createSolidPng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number }
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

/**
 * Generate a larger image with a distinctively colored region
 * at the specified coordinates — useful for testing landmark extraction.
 */
export async function createImageWithRegion(
  imageWidth: number,
  imageHeight: number,
  region: { x: number; y: number; width: number; height: number },
  bgColor: { r: number; g: number; b: number } = { r: 100, g: 100, b: 100 },
  regionColor: { r: number; g: number; b: number } = { r: 255, g: 0, b: 0 }
): Promise<Buffer> {
  // Create the colored region as an overlay
  const overlay = await sharp({
    create: {
      width: region.width,
      height: region.height,
      channels: 3,
      background: regionColor,
    },
  })
    .png()
    .toBuffer();

  // Create background and composite the region onto it
  return sharp({
    create: {
      width: imageWidth,
      height: imageHeight,
      channels: 3,
      background: bgColor,
    },
  })
    .composite([{ input: overlay, left: region.x, top: region.y }])
    .png()
    .toBuffer();
}
