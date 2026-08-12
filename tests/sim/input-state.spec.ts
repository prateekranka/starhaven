import { describe, expect, it } from "vitest";
import { cancelMode, enterAttack, initialInputState, selectOwnedUnit, tapEmptyTerrain } from "../../src/input/input-state";

describe("sticky touch command modes", () => {
  it("enters Order after selection and keeps selection after Cancel", () => {
    const selected = selectOwnedUnit(initialInputState(), [3, 1, 1]);
    expect(selected.mode).toBe("order");
    expect(selected.selectedIds).toEqual([1, 3]);
    expect(cancelMode(selected).selectedIds).toEqual([1, 3]);
  });

  it("enters Attack only with a selection and deselects on the next inactive terrain tap", () => {
    expect(enterAttack(initialInputState()).mode).toBeNull();
    const attack = enterAttack(selectOwnedUnit(initialInputState(), [1]));
    expect(attack.mode).toBe("attack");
    expect(tapEmptyTerrain(cancelMode(attack)).selectedIds).toEqual([]);
  });
});
