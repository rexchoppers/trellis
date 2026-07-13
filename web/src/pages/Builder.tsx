import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import { getPipeline, startRun, updatePipeline } from '../api'
import { ACTION_SPECS } from '../actions'
import { decorateEdges } from '../edges'
import type { Graph, NodeData, NodeType } from '../types'
import GateLegend from '../components/GateLegend'
import GateNode from '../components/GateNode'
import PipelineNode from '../components/PipelineNode'
import ConfigPanel from '../components/ConfigPanel'
import Palette from '../components/Palette'

const nodeTypes = {
  agent: PipelineNode,
  human_input: PipelineNode,
  approval: GateNode,
  action: PipelineNode,
  linear_wait: GateNode,
}

const NEW_NODE_DATA: Record<NodeType, NodeData> = {
  agent: { name: 'Agent', prompt: '', inputs: [], outputs: [] },
  human_input: { name: 'Human input', prompt: '', inputs: [], outputs: ['answer'] },
  approval: { name: 'Approval', prompt: '', inputs: [], outputs: ['decision'] },
  action: { name: 'Action', prompt: '', inputs: [], outputs: [], action: 'git_commit', params: {} },
  linear_wait: { name: 'Human feedback', prompt: '', inputs: [], outputs: ['reply'] },
}

const toFlowNodes = (graph: Graph): Node[] =>
  graph.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: { ...n.data } }))

const toFlowEdges = (graph: Graph): Edge[] =>
  graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle }))

const toGraph = (nodes: Node[], edges: Edge[]): Graph => ({
  nodes: nodes.map((n) => ({
    id: n.id,
    type: n.type as NodeType,
    position: { x: n.position.x, y: n.position.y },
    data: n.data as unknown as NodeData,
  })),
  edges: edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
  })),
})

function BuilderInner() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { screenToFlowPosition } = useReactFlow()

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [workdir, setWorkdir] = useState('')
  const [selectedID, setSelectedID] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    getPipeline(id!)
      .then((p) => {
        setName(p.name)
        setDescription(p.description)
        setWorkdir(p.workdir)
        setNodes(toFlowNodes(p.graph))
        setEdges(toFlowEdges(p.graph))
      })
      .catch((e) => setError(e.message))
  }, [id, setNodes, setEdges])

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  )

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/trellis-node') as NodeType
      if (!type) return
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const node: Node = {
        id: `n-${crypto.randomUUID().slice(0, 8)}`,
        type,
        position,
        data: { ...NEW_NODE_DATA[type] },
      }
      setNodes((nds) => [...nds, node])
      setSelectedID(node.id)
    },
    [screenToFlowPosition, setNodes],
  )

  const updateNodeData = (nodeID: string, data: NodeData) =>
    setNodes((nds) => nds.map((n) => (n.id === nodeID ? { ...n, data: { ...data } } : n)))

  const deleteNode = (nodeID: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeID))
    setEdges((eds) => eds.filter((e) => e.source !== nodeID && e.target !== nodeID))
    setSelectedID(null)
  }

  const cloneNode = (nodeID: string) => {
    const source = nodes.find((n) => n.id === nodeID)
    if (!source) return
    const clone: Node = {
      id: `n-${crypto.randomUUID().slice(0, 8)}`,
      type: source.type,
      position: { x: source.position.x + 40, y: source.position.y + 40 },
      data: structuredClone(source.data),
    }
    setNodes((nds) => [...nds, clone])
    setSelectedID(clone.id)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'd' || !selectedID) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      event.preventDefault()
      cloneNode(selectedID)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedID, nodes])

  const needsRepo = nodes.some(
    (n) => n.type === 'action' && ACTION_SPECS[(n.data as NodeData).action ?? '']?.needsRepo,
  )

  const save = async (): Promise<boolean> => {
    setError('')
    setNotice('')
    if (needsRepo && !workdir.trim()) {
      setError('Working directory is required because this pipeline has a git or GitHub action.')
      return false
    }
    try {
      await updatePipeline(id!, name, description, workdir.trim(), toGraph(nodes, edges))
      setNotice('Saved')
      setTimeout(() => setNotice(''), 1500)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  const run = async () => {
    if (!(await save())) return
    try {
      const r = await startRun(id!)
      navigate(`/runs/${r.id}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const selectedNode = nodes.find((n) => n.id === selectedID) ?? null

  return (
    <div className="canvas-page">
      <div className="topbar">
        <a href="/">← Pipelines</a>
        <input style={{ maxWidth: 220 }} value={name} onChange={(e) => setName(e.target.value)} />
        <input
          style={{ maxWidth: 260 }}
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          style={{
            maxWidth: 260,
            ...(needsRepo && !workdir.trim() ? { borderColor: 'var(--failed)' } : {}),
          }}
          placeholder={needsRepo ? 'Working directory (required for git actions)' : 'Working directory (default: trellis launch dir)'}
          title="Where this pipeline's agents and git actions run, e.g. ~/Projects/trakkt-pipeline"
          value={workdir}
          onChange={(e) => setWorkdir(e.target.value)}
        />
        <Palette />
        <div className="spacer" />
        {notice && <span style={{ color: 'var(--done)' }}>{notice}</span>}
        <button onClick={save}>Save</button>
        <button className="primary" onClick={run}>
          Test run
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="canvas-main">
        <div className="canvas-wrap" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
          <ReactFlow
            nodes={nodes}
            edges={decorateEdges(edges, nodes)}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedID(node.id)}
            onPaneClick={() => setSelectedID(null)}
            deleteKeyCode={['Backspace', 'Delete']}
            colorMode="dark"
            fitView
          >
            <Background />
            <Controls />
            <GateLegend show={nodes.some((n) => n.type === 'approval' || n.type === 'linear_wait')} />
          </ReactFlow>
        </div>
        {selectedNode && (
          <ConfigPanel
            node={selectedNode}
            onChange={updateNodeData}
            onClone={cloneNode}
            onDelete={deleteNode}
            onClose={() => setSelectedID(null)}
          />
        )}
      </div>
    </div>
  )
}

export default function Builder() {
  return (
    <ReactFlowProvider>
      <BuilderInner />
    </ReactFlowProvider>
  )
}
