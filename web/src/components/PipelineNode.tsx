import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ACTION_SPECS } from '../actions'
import { nodeTypeLabel } from '../types'
import GateSourceHandles from './GateSourceHandles'

export default function PipelineNode({ data, type, selected }: NodeProps) {
  const status = (data.status as string) ?? 'idle'
  const inputs = (data.inputs as string[]) ?? []
  const outputs = (data.outputs as string[]) ?? []
  const actionSpec = type === 'action' ? ACTION_SPECS[String(data.action ?? '')] : undefined
  return (
    <div className={`trellis-node status-${status} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-type">{nodeTypeLabel(String(type))}</div>
      <div className="node-name">{String(data.name ?? '')}</div>
      {actionSpec && <div className="node-keys">{actionSpec.label}</div>}
      {actionSpec && actionSpec.produces.length > 0 && (
        <div className="node-keys">out: {actionSpec.produces.join(', ')}</div>
      )}
      {!actionSpec && (inputs.length > 0 || outputs.length > 0) && (
        <div className="node-keys">
          {inputs.length > 0 && <div>in: {inputs.join(', ')}</div>}
          {outputs.length > 0 && <div>out: {outputs.join(', ')}</div>}
        </div>
      )}
      {type === 'human_input' ? (
        <GateSourceHandles />
      ) : (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  )
}
