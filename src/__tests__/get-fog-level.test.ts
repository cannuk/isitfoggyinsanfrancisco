import { describe, it, expect } from "vitest";
import { getFogLevel } from "../fog-detector.js";

describe("getFogLevel", () => {
  it("returns 'heavy' for scores below 20", () => {
    expect(getFogLevel(0)).toBe("heavy");
    expect(getFogLevel(10)).toBe("heavy");
    expect(getFogLevel(19)).toBe("heavy");
  });

  it("returns 'moderate' for scores 20-49", () => {
    expect(getFogLevel(20)).toBe("moderate");
    expect(getFogLevel(35)).toBe("moderate");
    expect(getFogLevel(49)).toBe("moderate");
  });

  it("returns 'light' for scores 50-79", () => {
    expect(getFogLevel(50)).toBe("light");
    expect(getFogLevel(65)).toBe("light");
    expect(getFogLevel(79)).toBe("light");
  });

  it("returns 'clear' for scores 80-100", () => {
    expect(getFogLevel(80)).toBe("clear");
    expect(getFogLevel(90)).toBe("clear");
    expect(getFogLevel(100)).toBe("clear");
  });
});
