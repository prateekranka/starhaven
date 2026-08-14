/** Offline-cache primitives shared by the service worker and the page warmer.
 * Pure functions only — safe in both `self` (SW) and `window` contexts.
 * Keep these byte-consistent: the SW serves what the page warms.
 */

export function cacheName(version) {
  return `starhaven-${version || "dev"}`;
}

export function isHtmlResponse(res) {
  if (!res) return false;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  return ct.includes("text/html");
}

export function isNonImageContentType(type) {
  const ct = String(type || "").toLowerCase();
  if (!ct) return false;
  if (ct.startsWith("image/")) return false;
  if (ct.includes("octet-stream") || ct.includes("binary")) return false;
  return true;
}

export function isImagePath(path) {
  return /\.(png|jpe?g|webp|gif)$/i.test(path || "");
}

export async function mapPool(items, limit, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, () => worker()));
}
