import { decodeBridgeMessage, encodeBridgeMessage } from "./codec";
import { PROTOCOL_VERSION, type BridgeEnvelope, type GameToNativeType, type NativeToGameType } from "./protocol.generated";

interface WebKitMessageHandler {
  postMessage(message: string): void;
}

interface WebKitBridge {
  messageHandlers?: { starhaven?: WebKitMessageHandler };
}

declare global {
  interface Window {
    webkit?: { messageHandlers?: { starhaven?: WebKitMessageHandler } };
    StarhavenBridge?: { receive(message: BridgeEnvelope): void };
  }
}

export class WebBridge {
  private sequence = 0;

  send<TPayload>(type: GameToNativeType, payload: TPayload, matchId?: string): void {
    const message: BridgeEnvelope<GameToNativeType, TPayload> = { version: PROTOCOL_VERSION, id: crypto.randomUUID(), sequence: this.sequence, source: "game", type, matchId, payload };
    this.sequence += 1;
    const handler = (window as Window & { webkit?: WebKitBridge }).webkit?.messageHandlers?.starhaven;
    handler?.postMessage(encodeBridgeMessage(message));
  }

  receive(encoded: string | BridgeEnvelope): BridgeEnvelope {
    const message = typeof encoded === "string" ? decodeBridgeMessage(encoded, "native") : decodeBridgeMessage(JSON.stringify(encoded), "native");
    return message;
  }

  static isNativeMessageType(type: string): type is NativeToGameType {
    return ["host.ready", "safeArea.changed", "settings.changed", "match.start", "match.pause", "match.resume", "match.rematch", "lifecycle.background", "lifecycle.foreground", "snapshot.request", "snapshot.ack", "match.restore"].includes(type as NativeToGameType);
  }
}
