/** @typedef {"runtime.ready"|"ack"|"feedback.haptic"|"pause.requested"|"match.started"|"match.snapshot"|"match.ended"|"returnMenu.requested"|"restore.completed"|"protocol.error"|"pack.channel"|"pack.reload"} GameToNativeType */

const PROTOCOL_VERSION = 1;

/** @type {ReadonlySet<string>} */
const GAME_TO_NATIVE_TYPES = new Set([
  "runtime.ready",
  "ack",
  "feedback.haptic",
  "pause.requested",
  "match.started",
  "match.snapshot",
  "match.ended",
  "returnMenu.requested",
  "restore.completed",
  "protocol.error",
  "pack.channel",
  "pack.reload",
]);

let sequence = 0;
let matchId = null;
let bridgeReady = false;

export function isNativeHost() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("host") === "native" || params.has("native");
}

function nextId() {
  return globalThis.crypto?.randomUUID?.() ?? `game-${Date.now()}-${sequence}`;
}

function logOutbound(encoded) {
  if (Array.isArray(window.__starhavenBridgeLog)) window.__starhavenBridgeLog.push(encoded);
  if (Array.isArray(window.__starhavenTestMessages)) window.__starhavenTestMessages.push(encoded);
  if (isNativeHost()) console.debug("[bridge→native]", JSON.parse(encoded));
}

/** @param {GameToNativeType} type @param {Record<string, unknown>} [payload] */
export function bridgeSend(type, payload = {}, options = {}) {
  if (!GAME_TO_NATIVE_TYPES.has(type)) {
    console.warn("[bridge] blocked unknown type", type);
    return null;
  }
  const envelope = {
    version: PROTOCOL_VERSION,
    id: nextId(),
    sequence: sequence++,
    source: "game",
    type,
    ...(options.matchId ?? matchId ? { matchId: options.matchId ?? matchId } : {}),
    payload,
  };
  const encoded = JSON.stringify(envelope);
  const handler = window.webkit?.messageHandlers?.starhaven;
  if (handler) handler.postMessage(encoded);
  logOutbound(encoded);
  return envelope;
}

/** @param {string} kind */
export function bridgeHaptic(kind) {
  bridgeSend("feedback.haptic", { kind });
}

export function setBridgeMatchId(id) {
  matchId = id || null;
}

function applySafeArea(payload = {}) {
  const root = document.documentElement;
  root.style.setProperty("--safe-area-top", `${payload.top || 0}px`);
  root.style.setProperty("--safe-area-right", `${payload.right || 0}px`);
  root.style.setProperty("--safe-area-bottom", `${payload.bottom || 0}px`);
  root.style.setProperty("--safe-area-left", `${payload.left || 0}px`);
}

function applyNativeSettings(payload = {}) {
  const patch = {};
  if (typeof payload.hapticsEnabled === "boolean") patch.haptics = payload.hapticsEnabled;
  if (typeof payload.reducedMotion === "boolean") patch.reduceMotion = payload.reducedMotion;
  if (typeof payload.soundEnabled === "boolean") patch.sfx = payload.soundEnabled ? 0.7 : 0;
  window.StarhavenNative?.applySettings?.(patch);
}

function readBuildIdentity() {
  const meta = document.querySelector('meta[name="starhaven-build"]');
  if (meta?.content) return meta.content;
  return "pixel-mesa";
}

function sendRuntimeReady(payload = {}) {
  if (bridgeReady) return;
  bridgeReady = true;
  bridgeSend("runtime.ready", {
    bridgeVersion: PROTOCOL_VERSION,
    build: payload.build || readBuildIdentity(),
    origin: payload.origin || "starhaven://app",
  });
}

function ensureMockHandler() {
  if (!isNativeHost() || window.webkit?.messageHandlers?.starhaven) return false;
  window.__starhavenBridgeLog = window.__starhavenBridgeLog || [];
  window.__starhavenTestMessages = window.__starhavenTestMessages || [];
  window.webkit = window.webkit || {};
  window.webkit.messageHandlers = window.webkit.messageHandlers || {};
  window.webkit.messageHandlers.starhaven = {
    postMessage(encoded) {
      logOutbound(typeof encoded === "string" ? encoded : JSON.stringify(encoded));
    },
  };
  return true;
}

function receiveNative(message) {
  if (!message || message.version !== PROTOCOL_VERSION || message.source !== "native") return;
  const payload = message.payload || {};
  switch (message.type) {
    case "host.ready":
      sendRuntimeReady(payload);
      break;
    case "safeArea.changed":
      applySafeArea(payload);
      break;
    case "settings.changed":
      applyNativeSettings(payload);
      break;
    case "match.start":
      window.StarhavenNative?.startSkirmish?.({
        playerFaction: payload.faction || "sunwoven",
        difficulty: payload.difficulty || "chieftain",
        seed: payload.seed,
      });
      break;
    case "match.pause":
      import("./game/main.js").then(({ togglePause }) => togglePause(true));
      break;
    case "match.resume":
      import("./game/main.js").then(({ togglePause }) => togglePause(false));
      break;
    case "lifecycle.background":
      import("./game/main.js").then(({ togglePause, sendMatchSnapshot }) => {
        togglePause(true);
        sendMatchSnapshot(true);
      });
      break;
    case "lifecycle.foreground":
      bridgeSend("ack", { acknowledgedType: "lifecycle.foreground" });
      break;
    case "snapshot.request":
      import("./game/main.js").then(({ sendMatchSnapshot }) => sendMatchSnapshot(true));
      break;
    case "snapshot.ack":
      bridgeSend("ack", { acknowledgedType: "snapshot.ack" });
      break;
    case "match.restore":
      import("./game/main.js").then(({ restoreMatch }) => restoreMatch(payload));
      break;
    default:
      break;
  }
}

export function sendPackChannel(channel) {
  bridgeSend("pack.channel", { channel });
}

export function sendPackReload() {
  bridgeSend("pack.reload", {});
}

/** @param {{ autoMockHostReady?: boolean }} [options] */
export function initBridge(options = {}) {
  const { autoMockHostReady = true } = options;
  const mock = ensureMockHandler();
  window.StarhavenBridge = { receive: receiveNative };
  if (mock && autoMockHostReady) {
    queueMicrotask(() => {
      receiveNative({
        version: PROTOCOL_VERSION,
        id: "mock-host-0",
        sequence: 0,
        source: "native",
        type: "host.ready",
        payload: { build: "mock-browser", bridgeVersion: PROTOCOL_VERSION },
      });
    });
  }
}
