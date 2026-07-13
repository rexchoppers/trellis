import { Handle, Position } from '@xyflow/react'
import { GATE_APPROVED, GATE_CHANGES, NODE_OUTLINE } from '../theme'

const dot = (background: string) => ({
  background,
  width: 13,
  height: 13,
  border: `2px solid ${NODE_OUTLINE}`,
})

// The two coloured source dots every decision gate shares: green "approved" on
// the right (continue), amber "changes requested" on the bottom (loops back to
// an earlier node). Used by both GateNode and a human_input PipelineNode.
export default function GateSourceHandles() {
  return (
    <>
      <Handle
        type="source"
        position={Position.Right}
        style={dot(GATE_APPROVED)}
        title="approved: continue to the next step"
      />
      <Handle
        id="changes"
        type="source"
        position={Position.Bottom}
        style={dot(GATE_CHANGES)}
        title="changes requested: connect back to an earlier node"
      />
    </>
  )
}
