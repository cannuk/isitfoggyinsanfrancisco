export interface LandmarkTemplate {
  name: string;
  templatePath: string;
  region: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  threshold: number; // Similarity threshold (0.0 to 1.0)
}

export type WebcamSource =
  | { type: "image"; url: string }
  | { type: "hls"; url: string };

export interface LocationConfig {
  location: string;
  region: string; // Geographic region ID (e.g., "golden-gate", "downtown")
  source: WebcamSource;
  landmarks: LandmarkTemplate[];
}

export interface VisibilityResult {
  location: string;
  region: string;
  landmarksVisible: number;
  totalLandmarks: number;
  visibilityScore: number; // 0-100
  fogLevel: FogLevel;
  timestamp: string;
  landmarkDetails: LandmarkDetail[];
}

export interface LandmarkDetail {
  name: string;
  visible: boolean;
  similarity: number;
}

export type FogLevel = "clear" | "light" | "moderate" | "heavy";

export interface FogObservation {
  timestamp: string;
  location: string;
  visibilityScore: number;
  fogLevel: FogLevel;
  landmarks: Record<string, boolean>;
}

export interface Prediction {
  estimatedClearTime: string | null;
  hoursUntilClear: number | null;
  confidence: number; // 0-100
  basedOnSamples: number;
  message: string;
}

export interface CurrentStatus {
  location: string;
  currentStatus: {
    fogLevel: FogLevel;
    visibilityScore: number;
    timestamp: string;
  };
  prediction: Prediction | null;
}

export interface HistoricalReading {
  timestamp: string;
  regions: {
    [regionId: string]: {
      fogLevel: FogLevel;
      visibilityScore: number;
      landmarksVisible: number;
      totalLandmarks: number;
    };
  };
}

export interface HistoricalData {
  readings: (HistoricalReading | null)[]; // 24-item array (indices 0-23 for hours), null for missing data
}

export interface HistoricalRecent {
  readings: HistoricalReading[]; // Array for chronological iteration across multiple days
}
