import type { NodeType } from '../types'

const PALETTE: { type: NodeType; label: string }[] = [
  { type: 'agent', label: '+ Agent' },
  { type: 'human_input', label: '+ Human input' },
  { type: 'approval', label: '+ Approval' },
  { type: 'action', label: '+ Action' },
  { type: 'linear_wait', label: '+ Human feedback' },
]

export default function Palette() {
  return (
    <div className="palette">
      {PALETTE.map((item) => (
        <div
          key={item.type}
          className="palette-node"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/trellis-node', item.type)
            e.dataTransfer.effectAllowed = 'move'
          }}
        >
          {item.label}
        </div>
      ))}
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>drag onto the canvas</span>
    </div>
  )
}
