import { loadSave } from "../boot.js";

let raf = 0;
let last = 0;
let pointer = { x: 0.5, y: 0.5 };
let motes = [];
let reduceMotion = false;

export function initTitleVista() {
  const screen = document.getElementById("screen-title");
  if (!screen) return;
  const vista = screen.querySelector(".title-vista");
  const canvas = screen.querySelector(".title-vista__motes");
  const sky = screen.querySelector(".title-vista__sky");
  const mesa = screen.querySelector(".title-vista__mesa");
  const line = screen.querySelector(".title-vista__bright-line");
  if (!vista || !canvas || !sky) return;

  reduceMotion = !!loadSave().settings.reduceMotion;
  const ctx = canvas.getContext("2d", { alpha: true });

  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.x = e.clientX / innerWidth;
      pointer.y = e.clientY / innerHeight;
    },
    { passive: true }
  );

  const obs = new MutationObserver(() => {
    if (screen.classList.contains("active")) start();
    else stop();
  });
  obs.observe(screen, { attributes: true, attributeFilter: ["class"] });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.floor(vista.clientWidth * dpr);
    canvas.height = Math.floor(vista.clientHeight * dpr);
    canvas.style.width = `${vista.clientWidth}px`;
    canvas.style.height = `${vista.clientHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedMotes(vista.clientWidth, vista.clientHeight);
  }
  resize();
  window.addEventListener("resize", resize);

  function start() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!screen.classList.contains("active")) {
      stop();
      return;
    }

    const t = now * 0.001;
    const bright = (Math.sin(t / 12) + 1) / 2;
    const px = reduceMotion ? 0 : (pointer.x - 0.5) * 18;
    const py = reduceMotion ? 0 : (pointer.y - 0.5) * 10;

    sky.style.transform = `translate3d(${px * 0.35}px, ${py * 0.2}px, 0) scale(1.06)`;
    if (mesa) mesa.style.transform = `translate3d(${px * 0.65}px, ${py * 0.45}px, 0)`;
    if (line) {
      const sweep = 8 + bright * (vista.clientWidth - 16);
      line.style.transform = `translate3d(${sweep}px, 0, 0)`;
      line.style.opacity = String(0.18 + Math.sin(t * 2.2) * 0.08);
    }

    const w = vista.clientWidth;
    const h = vista.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (!reduceMotion) {
      for (const m of motes) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.x < -4) m.x = w + 4;
        if (m.x > w + 4) m.x = -4;
        if (m.y < -4) m.y = h + 4;
        if (m.y > h + 4) m.y = -4;
        ctx.globalAlpha = m.a;
        ctx.fillStyle = m.c;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (screen.classList.contains("active")) start();
}

function seedMotes(w, h) {
  motes = [];
  const n = Math.floor((w * h) / 18000);
  for (let i = 0; i < Math.max(24, n); i++) {
    motes.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: 4 + Math.random() * 10,
      vy: -2 + Math.random() * 4,
      r: 0.6 + Math.random() * 1.4,
      a: 0.15 + Math.random() * 0.35,
      c: Math.random() > 0.55 ? "rgba(62,199,201,0.9)" : "rgba(240,215,138,0.85)",
    });
  }
}
