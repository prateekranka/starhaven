import { GAME_TO_NATIVE_TYPES, NATIVE_TO_GAME_TYPES, PROTOCOL_VERSION, type BridgeEnvelope, type GameToNativeType, type NativeToGameType } from "../protocol.generated";

export interface NativeSnapshotPayload {
  tick: number;
  checksum: string;
  seed: number;
  paused: boolean;
}

export interface NativeResultPayload {
  faction?: string;
  outcome?: string;
  duration?: string;
  build?: string;
  balance?: string;
  seed?: string;
  checksum?: string;
}

export interface NativeBridgeTraceEntry {
  direction: "native-to-game" | "game-to-native";
  type: NativeToGameType | GameToNativeType;
  sequence: number;
}

export function createNativeMessage<TPayload>(type: NativeToGameType, payload: TPayload, sequence: number, id = `native-${sequence}`): BridgeEnvelope<NativeToGameType, TPayload> {
  return { version: PROTOCOL_VERSION, id, sequence, source: "native", type, payload };
}

export function createGameMessage<TPayload>(type: GameToNativeType, payload: TPayload, sequence: number, id = `game-${sequence}`): BridgeEnvelope<GameToNativeType, TPayload> {
  return { version: PROTOCOL_VERSION, id, sequence, source: "game", type, payload };
}

export function isNativeToGameType(value: string): value is NativeToGameType {
  return NATIVE_TO_GAME_TYPES.includes(value as NativeToGameType);
}

export function isGameToNativeType(value: string): value is GameToNativeType {
  return GAME_TO_NATIVE_TYPES.includes(value as GameToNativeType);
}
