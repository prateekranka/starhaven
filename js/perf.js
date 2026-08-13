/** Quality profiles, 4K backing-store targeting, and a 60fps adaptive scaler. */

export const QUALITY = {
  low: { longEdge: 1280, maxH: 720, terrain: 32, vfx: 24, msaa: false, dprCap: 1.25, fogHz: 8, minimapHz: 6 },
  medium: { longEdge: 1920, maxH: 1080, terrain: 48, vfx: 40, msaa: false, dprCap: 1.75, fogHz: 10, minimapHz: 8 },
  high: { longEdge: 2560, maxH: 1440, terrain: 72, vfx: 64, msaa: true, dprCap: 2.25, fogHz: 12, minimapHz: 10 },
  ultra: { longEdge: 3840, maxH: 2160, terrain: 96, vfx: 96, msaa: false, dprCap: 3, fogHz: 15, minimapHz: 12 },
};

export function resolveQuality(name) {
  return QUALITY[name] || QUALITY.ultra;
}

export function isPadLike() {
  const ua = navigator.userAgent || "";
  return /iPad/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
}

export function detectDefaultQuality() {
  const dpr = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  if (isPadLike() || (dpr >= 2 && cores >= 6 && mem >= 4)) return "ultra";
  if (dpr >= 2 || cores >= 8) return "high";
  if (cores <= 4 && mem <= 4) return "medium";
  return "high";
}

/**
 * Backing store aimed at a 4K-class framebuffer on Ultra
 * (3840×2160 pixels, aspect-fit) while respecting the quality cap.
 */
export function pixelRatioFor(cssW, cssH, qualityName, adaptiveScale = 1) {
  const q = resolveQuality(qualityName);
  const w = Math.max(1, cssW);
  const h = Math.max(1, cssH);
  const native = Math.min(q.dprCap, window.devicePixelRatio || 1);
  const nativeRatio = Math.max(1, native);
  const capRatio = Math.min(q.longEdge / w, q.maxH / h, q.dprCap);
  const aimed = Math.max(nativeRatio, capRatio);
  return Math.max(0.45, Math.min(q.dprCap, aimed * adaptiveScale));
}

export function backingLabel(cssW, cssH, ratio) {
  const w = Math.round(cssW * ratio);
  const h = Math.round(cssH * ratio);
  const fourK = w >= 3200 || (w * h >= 3840 * 1600);
  return { w, h, fourK, text: `${w}×${h}` };
}

export function createFramePacer() {
  let ema = 16.6;
  let scale = 1;
  let fps = 60;
  let acc = 0;
  let n = 0;
  let lastApply = 0;
  return {
    sample(dtMs) {
      const ms = Math.max(0.1, dtMs);
      ema = ema * 0.88 + ms * 0.12;
      acc += ms;
      n++;
      if (acc >= 400) {
        fps = (n * 1000) / acc;
        acc = 0;
        n = 0;
      }
      // Hold 60fps: drop internal scale if we miss vsync, restore toward 4K when we have headroom.
      if (ema > 17.2) scale = Math.max(0.4, scale * 0.94);
      else if (ema < 13.5) scale = Math.min(1, scale * 1.03);
      return scale;
    },
    shouldApply(now) {
      if (now - lastApply < 180) return false;
      lastApply = now;
      return true;
    },
    get fps() {
      return fps;
    },
    get ema() {
      return ema;
    },
    get scale() {
      return scale;
    },
  };
}

export function glRendererName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const unmasked = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "") : "";
    const fallback = String(gl.getParameter(gl.RENDERER) || "");
    return `${unmasked} ${fallback}`.trim();
  } catch {
    return "";
  }
}

export function isSoftwareGL(renderer) {
  return /swiftshader|llvmpipe|softpipe|microsoft basic render|cpu rasterizer/i.test(glRendererName(renderer));
}

export function setText(id, value) {
  const el = typeof id === "string" ? document.getElementById(id) : id;
  if (!el) return;
  const v = value == null ? "" : String(value);
  if (el.textContent !== v) el.textContent = v;
}
