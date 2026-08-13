export const PERFORMANCE_BUDGET = {
  maxCombinedUnits: 36,
  maxProjectiles: 64,
  maxDevicePixelRatio: 2,
  nativeMaxDevicePixelRatio: 3,
} as const;

export type RenderQuality = "high" | "balanced";

export function isNativeRuntimeOrigin(locationLike: Pick<Location, "protocol"> = globalThis.location): boolean {
  return locationLike.protocol === "starhaven:";
}

export function pixelRatioForQuality(devicePixelRatio: number, quality: RenderQuality, nativeOrigin = isNativeRuntimeOrigin()): number {
  const dpr = Math.max(1, devicePixelRatio || 1);
  if (quality === "balanced") return Math.min(dpr, 1);
  const cap = nativeOrigin ? PERFORMANCE_BUDGET.nativeMaxDevicePixelRatio : PERFORMANCE_BUDGET.maxDevicePixelRatio;
  return Math.min(dpr, cap);
}
