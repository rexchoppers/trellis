import { useEffect, useState } from 'react'
import type { Node } from '@xyflow/react'
import { ACTION_SPECS } from '../actions'
import { nodeTypeLabel, type NodeData } from '../types'

interface Props {
  node: Node
  onChange: (id: string, data: NodeData) => void
  onClone: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const READ_TOOLS =
  'Read,Grep,Glob,Bash(rtk:*),Bash(grep:*),Bash(rg:*),Bash(find:*),Bash(ls:*),Bash(cat:*),Bash(head:*)'
const CODE_TOOLS =
  'Read,Grep,Glob,Write,Edit,Bash(pnpm:*),Bash(rtk:*),Bash(grep:*),Bash(rg:*),Bash(find:*),Bash(ls:*),Bash(cat:*),Bash(head:*)'
const REVIEW_TOOLS =
  'Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git show:*),Bash(rtk:*),Bash(grep:*),Bash(rg:*),Bash(find:*),Bash(ls:*),Bash(cat:*),Bash(head:*)'

const MODEL_OPTIONS = [
  { value: '', label: 'Default (inherit)' },
  { value: 'opus', label: 'Opus (complex work)' },
  { value: 'sonnet', label: 'Sonnet (balanced)' },
  { value: 'haiku', label: 'Haiku (discovery / light)' },
]

const parseKeys = (raw: string) =>
  raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)

export default function ConfigPanel({ node, onChange, onClone, onDelete, onClose }: Props) {
  const data = node.data as unknown as NodeData
  const [inputsRaw, setInputsRaw] = useState(data.inputs.join(', '))
  const [outputsRaw, setOutputsRaw] = useState(data.outputs.join(', '))

  useEffect(() => {
    const d = node.data as unknown as NodeData
    setInputsRaw(d.inputs.join(', '))
    setOutputsRaw(d.outputs.join(', '))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id])

  const update = (patch: Partial<NodeData>) => onChange(node.id, { ...data, ...patch })

  const promptLabel = node.type === 'agent' ? 'Prompt' : node.type === 'human_input' ? 'Question' : 'Instructions'

  if (node.type === 'action') {
    const spec = ACTION_SPECS[data.action ?? '']
    return (
      <div className="side-panel">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 style={{ flex: 1 }}>action node</h2>
          <button onClick={onClose}>Close</button>
        </div>
        <div>
          <label>Name</label>
          <input value={data.name} onChange={(e) => update({ name: e.target.value })} />
        </div>
        <div>
          <label>Action</label>
          <select
            value={data.action ?? ''}
            onChange={(e) => update({ action: e.target.value, params: {} })}
          >
            {Object.entries(ACTION_SPECS).map(([kind, s]) => (
              <option key={kind} value={kind}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {spec?.params.map((param) =>
          param.multiline ? (
            <div key={param.key}>
              <label>{param.label}</label>
              <textarea
                value={data.params?.[param.key] ?? ''}
                placeholder={param.placeholder ?? 'Use {{key}} to insert context values'}
                onChange={(e) => update({ params: { ...data.params, [param.key]: e.target.value } })}
              />
            </div>
          ) : (
            <div key={param.key}>
              <label>{param.label}</label>
              <input
                value={data.params?.[param.key] ?? ''}
                placeholder={param.placeholder ?? 'Use {{key}} to insert context values'}
                onChange={(e) => update({ params: { ...data.params, [param.key]: e.target.value } })}
              />
            </div>
          ),
        )}
        {spec && spec.produces.length > 0 && (
          <div className="panel-hint">Writes to context: {spec.produces.join(', ')}</div>
        )}
        {data.action?.startsWith('linear_') && (
          <div className="panel-hint">Needs the run to be started from a Linear issue.</div>
        )}
        <div className="panel-actions">
          <button onClick={() => onClone(node.id)}>Clone node</button>
          <button className="danger" onClick={() => onDelete(node.id)}>
            Delete node
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="side-panel">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h2 style={{ flex: 1 }}>{nodeTypeLabel(String(node.type))} node</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <div>
        <label>Name</label>
        <input value={data.name} onChange={(e) => update({ name: e.target.value })} />
      </div>
      {(node.type === 'linear_wait' || node.type === 'approval' || node.type === 'human_input') && (
        <div className="panel-hint">
          Decision gate with two fixed outcomes: <b>approved</b> continues along the green edge
          (right corner); <b>changes requested</b> loops back along the amber edge (bottom corner,
          drag it to an earlier node). The feedback text lands in the output keys either way. Max
          5 loops per gate.
        </div>
      )}
      {node.type === 'linear_wait' ? (
        <div className="panel-hint">
          Pauses the run until a new comment lands on the run's Linear issue; the comment text is
          written to the output keys. You can also answer from the run view.
        </div>
      ) : (
        <div>
          <label>{promptLabel}</label>
          <textarea
            value={data.prompt}
            placeholder={node.type === 'agent' ? 'Reference context keys as {{key}}' : ''}
            onChange={(e) => update({ prompt: e.target.value })}
          />
        </div>
      )}
      {node.type === 'agent' && (
        <>
          <div>
            <label>Model</label>
            <select value={data.model ?? ''} onChange={(e) => update({ model: e.target.value })}>
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <div className="panel-hint">
              Each node runs as its own claude subprocess. Use a lighter model for discovery and
              general tasks; keep Opus for complex code. Default inherits the CLI's model.
            </div>
          </div>
          <div>
            <label>Allowed tools</label>
            <input
              value={data.tools ?? ''}
              placeholder="empty = read-only, no writes"
              onChange={(e) => update({ tools: e.target.value })}
            />
            <div className="panel-presets">
              <button onClick={() => update({ tools: READ_TOOLS })}>Read-only</button>
              <button onClick={() => update({ tools: CODE_TOOLS })}>Code</button>
              <button onClick={() => update({ tools: REVIEW_TOOLS })}>Review</button>
            </div>
          </div>
        </>
      )}
      <div>
        <label>Inputs (context keys, comma-separated)</label>
        <input
          value={inputsRaw}
          onChange={(e) => {
            setInputsRaw(e.target.value)
            update({ inputs: parseKeys(e.target.value) })
          }}
        />
      </div>
      <div>
        <label>Outputs (context keys, comma-separated)</label>
        <input
          value={outputsRaw}
          onChange={(e) => {
            setOutputsRaw(e.target.value)
            update({ outputs: parseKeys(e.target.value) })
          }}
        />
      </div>
      <div className="panel-actions">
        <button onClick={() => onClone(node.id)}>Clone node</button>
        <button className="danger" onClick={() => onDelete(node.id)}>
          Delete node
        </button>
      </div>
    </div>
  )
}
