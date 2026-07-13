import { Handle, Position, type NodeProps } from '@xyflow/react'
import { nodeTypeLabel } from '../types'
import GateSourceHandles from './GateSourceHandles'

// Decision gates render as flowchart diamonds: one way in, two fixed ways
// out (approved to the right, changes requested below).
export default function GateNode({ data, type, selected }: NodeProps) {
  const status = (data.status as string) ?? 'idle'
  return (
    <div className={`gate-node status-${status} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="gate-diamond">
        <div className="gate-label">
          <div className="gate-type">{nodeTypeLabel(String(type))}</div>
          <div className="gate-name">{String(data.name ?? '')}</div>
        </div>
      </div>
      <GateSourceHandles />
    </div>
  )
}
