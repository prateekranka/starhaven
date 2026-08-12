export type InputMode = "order" | "attack" | "select" | "build";

export interface InputState {
  mode: InputMode | null;
  selectedIds: number[];
  selectionDrag: boolean;
  pointerCount: number;
  dragDistanceCss: number;
}

export type InputAction =
  | { type: "select"; entityIds: number[] }
  | { type: "move"; xQ10: number; yQ10: number }
  | { type: "attack"; targetEntityId: number }
  | { type: "deselect" }
  | { type: "cancel" }
  | { type: "context" };

export function initialInputState(): InputState {
  return { mode: null, selectedIds: [], selectionDrag: false, pointerCount: 0, dragDistanceCss: 0 };
}

export function selectOwnedUnit(state: InputState, entityIds: number[]): InputState {
  return { ...state, mode: "order", selectedIds: [...new Set(entityIds)].sort((left, right) => left - right), selectionDrag: false, dragDistanceCss: 0 };
}

export function issueMove(state: InputState): InputState {
  return { ...state, mode: state.selectedIds.length > 0 ? "order" : null };
}

export function enterAttack(state: InputState): InputState {
  return state.selectedIds.length > 0 ? { ...state, mode: "attack" } : state;
}

export function enterSelect(state: InputState): InputState {
  return { ...state, mode: "select" };
}

export function enterBuild(state: InputState): InputState {
  return { ...state, mode: "build" };
}

export function cancelMode(state: InputState): InputState {
  return { ...state, mode: null, selectionDrag: false, dragDistanceCss: 0 };
}

export function tapEmptyTerrain(state: InputState): InputState {
  return state.mode === null ? { ...state, selectedIds: [] } : { ...state, mode: null, selectionDrag: false };
}

export function modeLabel(state: InputState): string {
  return state.mode === null ? "Idle" : state.mode[0].toUpperCase() + state.mode.slice(1);
}
