import Foundation

public enum StarhavenNativeBridgeBootstrap {
    public static let source = #"""
    (() => {
      const state = { sequence: 0, matchStarted: false, nativePaused: false, finalSnapshot: null };
      const handler = () => window.webkit?.messageHandlers?.starhaven;
      const send = (type, payload) => {
        const target = handler();
        if (!target) return;
        target.postMessage(JSON.stringify({ version: 1, id: `game-${state.sequence}`, sequence: state.sequence++, source: "game", type, payload: payload || {} }));
      };
      const readText = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
      const observeState = () => {
        const match = document.querySelector('[data-testid="playable-match"]');
        if (match && !state.matchStarted) {
          state.matchStarted = true;
          state.nativePaused = false;
          send("match.started", { route: "playable", webView: "retained" });
        }
        const results = document.querySelector('[data-testid="results-screen"]');
        if (results && state.matchStarted) {
          state.matchStarted = false;
          send("match.ended", {
            faction: readText('[data-result="faction"]'),
            outcome: readText('[data-result="outcome"]'),
            duration: readText('[data-result="duration"]'),
            build: readText('[data-result="build"]'),
            balance: readText('[data-result="balance"]'),
            seed: readText('[data-result="seed"]'),
            checksum: readText('[data-result="checksum"]')
          });
        }
      };
      const readSnapshot = () => {
        const tickText = readText('[data-hud="tick"]');
        const seedText = readText('[data-hud="seed"]').replace(/^SEED\s+/i, "");
        const tickMatch = tickText.match(/TICK\s+(\d+)/i);
        const checksum = tickText.split("/").slice(1).join("/").trim();
        return { tick: Number(tickMatch?.[1] || 0), checksum, seed: Number.parseInt(seedText || "0", 16) >>> 0, paused: state.nativePaused };
      };
      const click = (selector) => document.querySelector(selector)?.click();
      window.StarhavenBridge = {
        receive(message) {
          if (!message || message.version !== 1 || message.source !== "native") return;
          const payload = message.payload || {};
          if (message.type === "host.ready") {
            send("runtime.ready", { bridgeVersion: 1, build: payload.build || "unknown", origin: "starhaven://app" });
          } else if (message.type === "safeArea.changed") {
            document.documentElement.style.setProperty("--safe-area-top", `${payload.top || 0}px`);
            document.documentElement.style.setProperty("--safe-area-right", `${payload.right || 0}px`);
            document.documentElement.style.setProperty("--safe-area-bottom", `${payload.bottom || 0}px`);
            document.documentElement.style.setProperty("--safe-area-left", `${payload.left || 0}px`);
          } else if (message.type === "settings.changed") {
            document.documentElement.dataset.reducedMotion = payload.reducedMotion ? "true" : "false";
          } else if (message.type === "match.start") {
            const nextURL = new URL(window.location.href);
            nextURL.search = `?demo=vertical-slice&seed=${encodeURIComponent(payload.seed ?? "")}&faction=${encodeURIComponent(payload.faction || "sunwoven")}&difficulty=${encodeURIComponent(payload.difficulty || "standard")}`;
            window.location.assign(nextURL.toString());
          } else if (message.type === "match.pause") {
            if (!document.querySelector('[data-testid="pause-overlay"]')) click('[data-action="pause"]');
            state.nativePaused = true;
          } else if (message.type === "match.resume") {
            click('[data-action="resume"]');
            state.nativePaused = false;
          } else if (message.type === "match.rematch") {
            click('[data-action="rematch"]');
          } else if (message.type === "lifecycle.background") {
            if (!document.querySelector('[data-testid="pause-overlay"]')) click('[data-action="pause"]');
            state.nativePaused = true;
            send("match.snapshot", readSnapshot());
          } else if (message.type === "lifecycle.foreground") {
            send("ack", { acknowledgedType: "lifecycle.foreground" });
          } else if (message.type === "snapshot.request") {
            state.finalSnapshot = readSnapshot();
            send("match.snapshot", state.finalSnapshot);
          } else if (message.type === "snapshot.ack") {
            send("ack", { acknowledgedType: "snapshot.ack" });
          } else if (message.type === "match.restore") {
            send("restore.completed", { restored: true, tick: payload.tick || 0, checksum: payload.checksum || "" });
          }
          observeState();
        }
      };
      const autoLaunchFromQuery = () => {
        const params = new URLSearchParams(window.location.search);
        if (params.get("demo") !== "vertical-slice") return;
        const titleStart = document.querySelector('[data-action="start"]');
        if (titleStart) {
          titleStart.click();
          return;
        }
        if (!document.querySelector('[data-testid="setup-screen"]')) return;
        const faction = params.get("faction");
        if (faction === "gravemark") document.querySelector('[data-faction="gravemark"]')?.click();
        const difficulty = params.get("difficulty");
        const difficultyInput = document.querySelector('[data-setup="difficulty"]');
        if (difficultyInput && difficulty) difficultyInput.value = difficulty;
        const seedInput = document.querySelector('[data-setup="seed"]');
        if (seedInput) seedInput.value = params.get("seed") || "";
        document.querySelector('[data-action="launch"]')?.click();
      };
      const startObserver = () => {
        autoLaunchFromQuery();
        observeState();
        const root = document.documentElement;
        if (root) new MutationObserver(observeState).observe(root, { childList: true, subtree: true });
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
      else startObserver();
    })();
    """#
}
