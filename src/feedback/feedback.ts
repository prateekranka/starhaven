export type FeedbackType = "orderAccepted" | "invalidOrder" | "fracture" | "matchEnded";
export type RenderQuality = "high" | "balanced";

export interface FeedbackSettings {
  audioEnabled: boolean;
  hapticsEnabled: boolean;
  reducedMotion: boolean;
  renderQuality: RenderQuality;
}

const SETTINGS_KEY = "starhaven.settings.v1";
const DEFAULT_SETTINGS: FeedbackSettings = { audioEnabled: true, hapticsEnabled: true, reducedMotion: false, renderQuality: "high" };

export interface FeedbackController {
  settings(): FeedbackSettings;
  setSettings(next: FeedbackSettings): void;
  arm(): void;
  emit(type: FeedbackType): void;
  dispose(): void;
}

export function loadFeedbackSettings(): FeedbackSettings {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const value = JSON.parse(raw) as Partial<FeedbackSettings>;
    return {
      audioEnabled: value.audioEnabled !== false,
      hapticsEnabled: value.hapticsEnabled !== false,
      reducedMotion: value.reducedMotion === true,
      renderQuality: value.renderQuality === "balanced" ? "balanced" : "high",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function createFeedbackController(): FeedbackController {
  let current = loadFeedbackSettings();
  let audioContext: AudioContext | null = null;
  let armed = false;
  const bridge = new WebBridge();
  const activate = (): void => controller.arm();
  document.addEventListener("pointerdown", activate, { passive: true });
  document.addEventListener("keydown", activate, { passive: true });
  applyMotionSetting(current.reducedMotion);

  const controller: FeedbackController = {
    settings: () => ({ ...current }),
    setSettings(next) {
      current = { ...next };
      applyMotionSetting(current.reducedMotion);
      try { globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(current)); } catch { /* Storage is optional in native/private mode. */ }
      if (current.audioEnabled) void resumeAudio();
    },
    arm() {
      armed = true;
      if (current.audioEnabled) void resumeAudio();
    },
    emit(type) {
      controller.arm();
      globalThis.dispatchEvent(new CustomEvent("starhaven:feedback", { detail: { type } }));
      bridge.send("feedback.haptic", { kind: type });
      if (current.hapticsEnabled && "vibrate" in navigator) navigator.vibrate(type === "matchEnded" ? [20, 30, 60] : type === "invalidOrder" ? 30 : 12);
      if (current.audioEnabled && armed) playTone(type);
    },
    dispose() {
      document.removeEventListener("pointerdown", activate);
      document.removeEventListener("keydown", activate);
      if (audioContext) void audioContext.close();
      audioContext = null;
    },
  };

  return controller;

  async function resumeAudio(): Promise<void> {
    const AudioContextConstructor = globalThis.AudioContext;
    if (!AudioContextConstructor) return;
    audioContext ??= new AudioContextConstructor();
    if (audioContext.state === "suspended") await audioContext.resume();
  }

  function playTone(type: FeedbackType): void {
    if (!audioContext || audioContext.state !== "running") return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = type === "fracture" ? "sine" : "triangle";
    oscillator.frequency.value = type === "orderAccepted" ? 520 : type === "invalidOrder" ? 160 : type === "fracture" ? 220 : 680;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(type === "fracture" ? 0.08 : 0.045, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (type === "fracture" ? 0.24 : 0.1));
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + (type === "fracture" ? 0.25 : 0.11));
  }
}

function applyMotionSetting(reducedMotion: boolean): void {
  document.documentElement.dataset.reducedMotion = reducedMotion ? "true" : "false";
}
import { WebBridge } from "../bridge/web";
