# Is It Foggy in San Francisco?

Real-time fog detection for San Francisco locations using webcam imagery analysis.

## How It Works

1. **Webcam images** are fetched hourly from cameras around San Francisco
2. **Landmark detection** compares known landmarks against clear-day templates
3. **Fog level** is determined by how many landmarks are visible (clear / light / moderate / heavy)
4. **Results** are published as a static JSON API and displayed on the website

## Architecture

- **GitHub Actions** — scheduled hourly workflow fetches webcams, runs analysis, commits results
- **GitHub Pages** — serves the static site and API endpoints
- **Sharp + Pixelmatch** — fast image comparison (~2ms per landmark)
- **Zero cost** — runs entirely on GitHub's free tier

## Setup

```bash
npm install
```

### Configure a webcam location

1. Find a webcam on [sfcam.live](https://sfcam.live/) on a clear day
2. Identify 3-5 landmarks visible in the image
3. Note their pixel coordinates (x, y, width, height)
4. Run the setup script to create templates:

```typescript
import { createTemplateWithCoordinates } from './src/setup-templates.js';

await createTemplateWithCoordinates(
  'https://sfcam.live/marina',
  'marina',
  [
    { name: 'golden-gate-tower', x: 250, y: 180, width: 100, height: 150 },
    { name: 'fort-point', x: 420, y: 350, width: 80, height: 100 },
  ]
);
```

### Run a fog check

```bash
npm run check
```

### Build TypeScript

```bash
npm run build
```

## Project Structure

```
src/
  types.ts             — shared TypeScript interfaces
  fog-detector.ts      — core landmark comparison logic
  setup-templates.ts   — one-time webcam/landmark setup
  check-fog.ts         — main entry: check all locations, write API output
templates/             — stored clear-day landmark images
data/locations/        — location config files (webcam URL + landmark coordinates)
api/                   — static API output (current.json)
site/                  — static website
.github/workflows/     — GitHub Actions hourly fog check
```

## API

### `GET /api/current.json`

Returns current fog conditions for all configured locations.

```json
[
  {
    "location": "marina",
    "currentStatus": {
      "fogLevel": "moderate",
      "visibilityScore": 33,
      "timestamp": "2025-02-14T09:00:00Z"
    },
    "prediction": null
  }
]
```
