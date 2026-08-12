import { GAME_TO_NATIVE_TYPES, NATIVE_TO_GAME_TYPES, PROTOCOL_VERSION, type BridgeEnvelope, type BridgeSource } from "./protocol.generated";

export function encodeBridgeMessage<TType extends string, TPayload>(message: BridgeEnvelope<TType, TPayload>): string {
  validateEnvelope(message as unknown as Record<string, unknown>, message.source === "native" ? NATIVE_TO_GAME_TYPES : GAME_TO_NATIVE_TYPES);
  return JSON.stringify(message);
}

export function decodeBridgeMessage(encoded: string, expectedSource: BridgeSource): BridgeEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(encoded);
  } catch {
    throw new Error("Bridge message is not valid JSON");
  }
  if (typeof value !== "object" || value === null) throw new Error("Bridge message must be an object");
  const message = value as Record<string, unknown>;
  const allowed = expectedSource === "native" ? NATIVE_TO_GAME_TYPES : GAME_TO_NATIVE_TYPES;
  validateEnvelope(message, allowed);
  if (message.source !== expectedSource) throw new Error("Bridge source mismatch");
  return message as unknown as BridgeEnvelope;
}

function validateEnvelope(message: Record<string, unknown>, allowed: readonly string[]): void {
  if (message.version !== PROTOCOL_VERSION) throw new Error("Bridge protocol version mismatch");
  if (typeof message.id !== "string" || message.id.length === 0) throw new Error("Bridge message id is required");
  if (typeof message.sequence !== "number" || !Number.isInteger(message.sequence) || message.sequence < 0) throw new Error("Bridge sequence is invalid");
  if (message.source !== "native" && message.source !== "game") throw new Error("Bridge source is invalid");
  if (typeof message.type !== "string" || !allowed.includes(message.type)) throw new Error("Bridge message type is not allowed");
  if (!("payload" in message)) throw new Error("Bridge payload is required");
}
