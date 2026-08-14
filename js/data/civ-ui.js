/**
 * Data-driven setup and lore screens for playable civs.
 */

import { listPlayableCivs, DEFAULT_CIV_ID } from "./civ-schema.js";
import { isQaMode } from "../perf.js";
import "./civs.js";

function playableCivs() {
  return listPlayableCivs({ qa: isQaMode() });
}

export function renderFactionPicks(container, { selectedId = DEFAULT_CIV_ID, onSelect } = {}) {
  if (!container) return;
  container.replaceChildren();
  for (const civ of playableCivs()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `faction-pick${civ.id === selectedId ? " selected" : ""}`;
    btn.dataset.faction = civ.id;
    btn.innerHTML = `
      <span class="faction-portrait">
        <img src="${civ.identity.portrait}" alt="${civ.identity.name}" />
      </span>
      <strong>${civ.identity.name}</strong>
      <em>${civ.identity.tagline}</em>
    `;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".faction-pick").forEach((x) => x.classList.remove("selected"));
      btn.classList.add("selected");
      onSelect?.(civ.id, btn);
    });
    container.appendChild(btn);
  }
}

export function renderLoreGrid(container) {
  if (!container) return;
  container.replaceChildren();
  for (const civ of playableCivs()) {
    const article = document.createElement("article");
    article.className = "lore";
    article.dataset.civ = civ.id;
    const ages = (civ.identity.lore?.ages || [])
      .map((line) => `<li>${line}</li>`)
      .join("");
    article.innerHTML = `
      <img src="${civ.identity.portrait}" alt="" />
      <h3>${civ.identity.name}</h3>
      <p>${civ.identity.lore?.blurb || civ.identity.tagline}</p>
      <ul>${ages}</ul>
    `;
    container.appendChild(article);
  }
}

