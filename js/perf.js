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

export function isQaMode() {
  return new URLSearchParams(location.search).get("qa") === "1";
}

export function createFramePacer() {
  let frameEma = 16.7;
  let workEma = 8;
  let vsyncMs = 16.7;
  let scale = 1;
  let fps = 60;
  let acc = 0;
  let n = 0;
  let lastApply = 0;
  return {
    sample(dtMs, workMs = dtMs) {
      const ms = Math.max(0.1, dtMs);
      const work = Math.max(0, workMs);
      frameEma = frameEma * 0.88 + ms * 0.12;
      workEma = workEma * 0.88 + work * 0.12;
      if (ms < 50) vsyncMs = vsyncMs * 0.985 + ms * 0.015;
      const target = Math.min(20, Math.max(7.5, vsyncMs));
      const budget = target * 0.82;
      const missed = ms > target * 1.35;

      acc += ms;
      n++;
      if (acc >= 400) {
        fps = (n * 1000) / acc;
        acc = 0;
        n = 0;
      }

      // Drop scale on missed vsync or render-work over budget; recover on work headroom (works at 60Hz).
      if (missed || workEma > budget || frameEma > target * 1.12) scale = Math.max(0.4, scale * 0.94);
      else if (workEma < budget * 0.72) scale = Math.min(1, scale * 1.03);
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
      return frameEma;
    },
    get workEma() {
      return workEma;
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
