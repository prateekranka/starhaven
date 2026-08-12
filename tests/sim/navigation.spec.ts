import { describe, expect, it } from "vitest";
import { NavigationGraph } from "../../src/game/sim/navigation";

describe("authored navigation graph", () => {
  it("keeps central fracture edges closed until the fracture opens", () => {
    const graph = new NavigationGraph();
    expect(graph.route("sunWest", "gravemarkEast")).toBeNull();
    graph.setFractureOpen(true);
    const route = graph.route("sunWest", "gravemarkEast");
    expect(route?.nodes[0]).toBe("sunWest");
    expect(route?.nodes.at(-1)).toBe("gravemarkEast");
  });
});
