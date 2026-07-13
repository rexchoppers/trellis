import { type Edge } from '@xyflow/react'
import { GATE_APPROVED, GATE_CHANGES } from './theme'

const ALWAYS_GATE_TYPES = new Set(['approval', 'linear_wait'])

// decorateEdges colours a gate's two branches so they read like a decision
// tree: the forward "approved" edge is green, the loop-back "changes" edge is
// amber and dashed. No arrowheads or labels; the coloured source dot on the
// gate node is the marker. Pure render-time decoration; the stored graph keeps
// only id/source/target/sourceHandle.
export function decorateEdges(edges: Edge[], nodes: { id: string; type?: string }[]): Edge[] {
  const gateIDs = new Set(
    nodes.filter((n) => n.type && ALWAYS_GATE_TYPES.has(n.type)).map((n) => n.id),
  )
  // A human_input node acts as a gate once it has a changes edge.
  for (const edge of edges) {
    if (edge.sourceHandle === 'changes') gateIDs.add(edge.source)
  }
  return edges.map((edge) => {
    if (edge.sourceHandle === 'changes') {
      return { ...edge, animated: true, style: { stroke: GATE_CHANGES, strokeWidth: 2.5, strokeDasharray: '7 5' } }
    }
    if (gateIDs.has(edge.source)) {
      return { ...edge, style: { stroke: GATE_APPROVED, strokeWidth: 2.5 } }
    }
    return edge
  })
}
