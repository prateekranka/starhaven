import { ARENA_V1 } from "../content/arena.v1";
import type { ArenaEdge, NodeId } from "../content/schema";

export interface NavigationRoute {
  nodes: NodeId[];
  cost: number;
}

export class NavigationGraph {
  private readonly edges: readonly ArenaEdge[] = ARENA_V1.edges;
  private fractureOpen = false;

  setFractureOpen(open: boolean): void {
    this.fractureOpen = open;
  }

  isEdgeOpen(edge: ArenaEdge): boolean {
    return this.fractureOpen || !edge.fractureClosed;
  }

  route(from: NodeId, to: NodeId): NavigationRoute | null {
    const frontier: Array<{ node: NodeId; cost: number; path: NodeId[] }> = [{ node: from, cost: 0, path: [from] }];
    const best = new Map<NodeId, number>([[from, 0]]);
    while (frontier.length > 0) {
      const current = frontier.shift();
      if (!current) break;
      if (current.node === to) return { nodes: current.path, cost: current.cost };
      for (const edge of this.neighbors(current.node)) {
        if (!this.isEdgeOpen(edge)) continue;
        const next = edge.from === current.node ? edge.to : edge.from;
        const nextCost = current.cost + edge.cost;
        const oldCost = best.get(next);
        if (oldCost !== undefined && oldCost <= nextCost) continue;
        best.set(next, nextCost);
        frontier.push({ node: next, cost: nextCost, path: [...current.path, next] });
      }
      frontier.sort((left, right) => left.cost - right.cost || left.node.localeCompare(right.node));
    }
    return null;
  }

  neighbors(node: NodeId): ArenaEdge[] {
    return this.edges.filter((edge) => edge.from === node || edge.to === node);
  }
}
