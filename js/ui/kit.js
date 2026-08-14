/** Cohesive in-game UI controls — dropdown, slider, toggle. */

let openDropdown = null;

function closeOpenDropdown(except) {
  if (openDropdown && openDropdown !== except) {
    openDropdown.classList.remove("open");
    openDropdown.querySelector(".ui-dropdown-trigger")?.setAttribute("aria-expanded", "false");
    openDropdown = null;
  }
}

document.addEventListener("pointerdown", (e) => {
  if (!openDropdown) return;
  if (!e.target.closest(".ui-dropdown")) closeOpenDropdown();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeOpenDropdown();
});

export function bindDropdown(root, opts = {}) {
  const trigger = root.querySelector(".ui-dropdown-trigger");
  const label = root.querySelector(".ui-dropdown-label");
  const options = [...root.querySelectorAll(".ui-dropdown-option")];
  const hidden = root.querySelector('input[type="hidden"]');
  let index = Math.max(0, options.findIndex((o) => o.dataset.value === (opts.value ?? hidden?.value ?? options[0]?.dataset.value)));

  function setIndex(next, fire = true) {
    index = Math.max(0, Math.min(options.length - 1, next));
    const opt = options[index];
    const val = opt.dataset.value;
    if (label) label.textContent = opt.textContent.trim();
    options.forEach((o, i) => {
      o.classList.toggle("selected", i === index);
      o.setAttribute("aria-selected", i === index ? "true" : "false");
    });
    if (hidden) hidden.value = val;
    root.dataset.value = val;
    if (fire) {
      hidden?.dispatchEvent(new Event("change", { bubbles: true }));
      opts.onChange?.(val);
    }
  }

  function open() {
    closeOpenDropdown(root);
    root.classList.add("open");
    trigger?.setAttribute("aria-expanded", "true");
    openDropdown = root;
    options[index]?.scrollIntoView({ block: "nearest" });
  }

  function close() {
    root.classList.remove("open");
    trigger?.setAttribute("aria-expanded", "false");
    if (openDropdown === root) openDropdown = null;
  }

  trigger?.addEventListener("click", () => {
    if (root.classList.contains("open")) close();
    else open();
  });

  trigger?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!root.classList.contains("open")) open();
      else setIndex(index + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!root.classList.contains("open")) open();
      else setIndex(index - 1);
    }
  });

  options.forEach((opt, i) => {
    opt.tabIndex = -1;
    opt.addEventListener("click", () => {
      setIndex(i);
      close();
      trigger?.focus();
    });
    opt.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIndex(i);
        close();
        trigger?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex(i + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex(i - 1);
      }
    });
  });

  if (opts.value != null) setIndex(options.findIndex((o) => o.dataset.value === opts.value), false);
  else setIndex(index, false);

  return {
    get value() { return options[index]?.dataset.value ?? ""; },
    set value(v) {
      const i = options.findIndex((o) => o.dataset.value === v);
      if (i >= 0) setIndex(i);
    },
  };
}

export function bindSlider(root, opts = {}) {
  const input = root.querySelector('input[type="range"]');
  const fill = root.querySelector(".ui-slider-fill");
  const thumb = root.querySelector(".ui-slider-thumb");
  const readout = root.querySelector(".ui-slider-value") || root.closest(".ui-field")?.querySelector(".ui-slider-value");
  const track = root.querySelector(".ui-slider-track");
  if (!input || !track) return null;

  const min = Number(opts.min ?? input.min ?? 0);
  const max = Number(opts.max ?? input.max ?? 1);
  const step = Number(opts.step ?? input.step ?? 0.05);

  function pct(val) { return max === min ? 0 : ((val - min) / (max - min)) * 100; }

  function paint(val) {
    const p = pct(val);
    if (fill) fill.style.width = `${p}%`;
    if (thumb) thumb.style.left = `${p}%`;
    if (readout) readout.textContent = `${Math.round(p)}%`;
  }

  function setValue(val, fire = true) {
    const snapped = Math.round((val - min) / step) * step + min;
    const clamped = Math.max(min, Math.min(max, snapped));
    input.value = String(clamped);
    paint(clamped);
    if (fire) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      opts.onChange?.(clamped);
    }
  }

  input.addEventListener("input", () => paint(Number(input.value)));
  input.addEventListener("change", () => paint(Number(input.value)));

  let dragging = false;
  function valueFromClientX(clientX) {
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return min + ratio * (max - min);
  }

  track.addEventListener("pointerdown", (e) => {
    dragging = true;
    track.setPointerCapture(e.pointerId);
    setValue(valueFromClientX(e.clientX));
  });
  track.addEventListener("pointermove", (e) => { if (dragging) setValue(valueFromClientX(e.clientX)); });
  track.addEventListener("pointerup", () => { dragging = false; });
  track.addEventListener("pointercancel", () => { dragging = false; });
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setValue(Number(input.value) + step); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setValue(Number(input.value) - step); }
  });

  if (opts.value != null) setValue(opts.value, false);
  else paint(Number(input.value));
  return { get value() { return Number(input.value); }, set value(v) { setValue(v); }, input };
}

export function bindToggle(root, opts = {}) {
  const btn = root.querySelector(".ui-toggle-btn");
  const input = root.querySelector('input[type="checkbox"]');
  if (!btn || !input) return null;

  function setChecked(on, fire = true) {
    input.checked = on;
    btn.setAttribute("aria-checked", on ? "true" : "false");
    root.classList.toggle("on", on);
    if (fire) {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      opts.onChange?.(on);
    }
  }

  btn.addEventListener("click", () => setChecked(!input.checked));
  btn.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); setChecked(!input.checked); }
  });

  setChecked(opts.checked ?? input.checked, false);
  return { get checked() { return input.checked; }, set checked(v) { setChecked(v); }, input };
}

export function initKit(container = document) {
  container.querySelectorAll(".ui-slider").forEach((el) => {
    if (el.dataset.kitBound) return;
    el.dataset.kitBound = "1";
    bindSlider(el);
  });
  container.querySelectorAll(".ui-toggle").forEach((el) => {
    if (el.dataset.kitBound) return;
    el.dataset.kitBound = "1";
    bindToggle(el);
  });
}
