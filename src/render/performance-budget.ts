export const PERFORMANCE_BUDGET = {
  maxCombinedUnits: 36,
  maxProjectiles: 64,
  maxDevicePixelRatio: 2,
} as const;

export type RenderQuality = "high" | "balanced";

export function pixelRatioForQuality(devicePixelRatio: number, quality: RenderQuality): number {
  const cap = quality === "balanced" ? 1 : PERFORMANCE_BUDGET.maxDevicePixelRatio;
  return Math.min(Math.max(1, devicePixelRatio || 1), cap);
}
