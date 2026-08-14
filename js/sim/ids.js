/** Single entity id allocator for the sim. One counter per match, reset at createMatch. */

let nextId = 1;

export function resetIds() {
  nextId = 1;
}

export function allocateId() {
  return nextId++;
}
