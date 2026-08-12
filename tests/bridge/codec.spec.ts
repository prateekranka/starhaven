import { describe, expect, it } from "vitest";
import { decodeBridgeMessage, encodeBridgeMessage } from "../../src/bridge/codec";

describe("versioned bridge codec", () => {
  it("round-trips a typed native message", () => {
    const encoded = encodeBridgeMessage({ version: 1, id: "req-1", sequence: 0, source: "native", type: "host.ready", payload: { build: "test" } });
    expect(decodeBridgeMessage(encoded, "native").type).toBe("host.ready");
  });

  it("fails closed for version, source, and type changes", () => {
    expect(() => decodeBridgeMessage(JSON.stringify({ version: 2, id: "x", sequence: 0, source: "native", type: "host.ready", payload: {} }), "native")).toThrow(/version/i);
    expect(() => decodeBridgeMessage(JSON.stringify({ version: 1, id: "x", sequence: 0, source: "game", type: "host.ready", payload: {} }), "native")).toThrow(/source/i);
    expect(() => decodeBridgeMessage(JSON.stringify({ version: 1, id: "x", sequence: 0, source: "native", type: "eval", payload: {} }), "native")).toThrow(/type/i);
  });
});
