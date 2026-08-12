import { q10FromWorld } from "../game/sim/fixed";
import { cancelMode, enterAttack, initialInputState, issueMove, selectOwnedUnit, tapEmptyTerrain, type InputAction, type InputState } from "./input-state";

const DRAG_THRESHOLD_CSS_PX = 6;

export class PointerController {
  private readonly element: HTMLElement;
  private readonly onAction: (action: InputAction) => void;
  private state: InputState = initialInputState();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private anchor: { x: number; y: number } | null = null;

  constructor(element: HTMLElement, onAction: (action: InputAction) => void) {
    this.element = element;
    this.onAction = onAction;
    element.addEventListener("pointerdown", this.onPointerDown);
    element.addEventListener("pointermove", this.onPointerMove);
    element.addEventListener("pointerup", this.onPointerUp);
    element.addEventListener("pointercancel", this.onPointerUp);
    element.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  getState(): InputState {
    return { ...this.state, selectedIds: [...this.state.selectedIds] };
  }

  setSelection(entityIds: number[]): void {
    this.state = selectOwnedUnit(this.state, entityIds);
    this.onAction({ type: "select", entityIds: this.state.selectedIds });
  }

  attackMode(): void {
    this.state = enterAttack(this.state);
  }

  cancel(): void {
    this.state = cancelMode(this.state);
    this.onAction({ type: "cancel" });
  }

  dispose(): void {
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerUp);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.state = { ...this.state, pointerCount: this.pointers.size };
    if (this.pointers.size === 1) this.anchor = { x: event.clientX, y: event.clientY };
    this.element.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const point = this.pointers.get(event.pointerId);
    if (!point) return;
    point.x = event.clientX;
    point.y = event.clientY;
    if (this.anchor && this.pointers.size === 1) {
      const dx = event.clientX - this.anchor.x;
      const dy = event.clientY - this.anchor.y;
      this.state = { ...this.state, dragDistanceCss: Math.max(this.state.dragDistanceCss, Math.round(Math.sqrt(dx * dx + dy * dy))) };
      if (this.state.dragDistanceCss > DRAG_THRESHOLD_CSS_PX && this.state.mode === "select") this.state = { ...this.state, selectionDrag: true };
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const point = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);
    this.state = { ...this.state, pointerCount: this.pointers.size };
    if (!point || !this.anchor || this.pointers.size > 0) return;
    const moved = this.state.dragDistanceCss > DRAG_THRESHOLD_CSS_PX;
    this.anchor = null;
    if (moved) {
      this.state = { ...this.state, dragDistanceCss: 0 };
      return;
    }
    if (this.state.mode === "order") {
      this.state = issueMove(this.state);
      this.onAction({ type: "move", xQ10: q10FromWorld(event.offsetX / 32), yQ10: q10FromWorld(event.offsetY / 32) });
    } else if (this.state.mode === "attack") {
      this.onAction({ type: "attack", targetEntityId: -1 });
    } else {
      this.state = tapEmptyTerrain(this.state);
      this.onAction({ type: "deselect" });
    }
    this.state = { ...this.state, dragDistanceCss: 0 };
  };
}
