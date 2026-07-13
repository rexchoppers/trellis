import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react'
import { getRun } from '../api'
import { decorateEdges } from '../edges'
import type { NodeRun, RunDetail, Status } from '../types'
import GateLegend from '../components/GateLegend'
import GateNode from '../components/GateNode'
import PipelineNode from '../components/PipelineNode'
import ResumePanel from '../components/ResumePanel'

const nodeTypes = {
  agent: PipelineNode,
  human_input: PipelineNode,
  approval: GateNode,
  action: PipelineNode,
  linear_wait: GateNode,
}

function NodeInspector({ nodeRun, name, live, onClose }: { nodeRun: NodeRun; name: string; live: boolean; onClose: () => void }) {
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [nodeRun.log])

  const output = Object.entries(nodeRun.output).filter(([, value]) => value !== '')
  return (
    <div className="side-panel node-inspector">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ flex: 1 }}>{name}</h2>
        <span className={`badge ${nodeRun.status}`}>{nodeRun.status.replace('_', ' ')}</span>
        <button onClick={onClose}>Close</button>
      </div>
      {nodeRun.log ? (
        <div>
          <label>{live ? 'Live output' : 'Output log'}</label>
          <pre className="node-log" ref={logRef}>
            {nodeRun.log}
          </pre>
        </div>
      ) : (
        <div className="panel-hint">{live ? 'Working, no output yet...' : 'No log for this node.'}</div>
      )}
      {output.length > 0 && (
        <div>
          <label>Result</label>
          <pre className="node-log">
            {output
              .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}`)
              .join('\n\n')}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function RunView() {
  const { id } = useParams()
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [inspectedID, setInspectedID] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getRun(id!)
      .then(setDetail)
      .catch((e) => setError(e.message))

    const source = new EventSource(`/api/runs/${id}/stream`)
    source.onmessage = (event) => setDetail(JSON.parse(event.data))
    return () => source.close()
  }, [id])

  const { nodes, edges } = useMemo((): { nodes: Node[]; edges: Edge[] } => {
    if (!detail) return { nodes: [], edges: [] }
    const statusByNode: Record<string, Status> = {}
    for (const nodeRun of detail.node_runs) {
      statusByNode[nodeRun.node_id] = nodeRun.status
    }
    return {
      nodes: detail.graph.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: { ...n.data, status: statusByNode[n.id] ?? 'idle' },
        draggable: false,
        connectable: false,
        selected: n.id === detail.run.current_node_id,
      })),
      edges: decorateEdges(
        detail.graph.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
        })),
        detail.graph.nodes,
      ),
    }
  }, [detail])

  if (error) return <div className="error-banner">{error}</div>
  if (!detail) return <div className="context-details">Loading…</div>

  const waitingNode =
    detail.run.status === 'waiting_human'
      ? detail.graph.nodes.find((n) => n.id === detail.run.current_node_id)
      : undefined

  const followedID =
    inspectedID ?? (detail.run.status === 'running' ? detail.run.current_node_id : null)
  const inspectedRun = followedID
    ? detail.node_runs.filter((nr) => nr.node_id === followedID).at(-1)
    : undefined
  const inspectedName =
    detail.graph.nodes.find((n) => n.id === followedID)?.data.name ?? followedID ?? ''
  const inspectorLive =
    detail.run.status === 'running' && detail.run.current_node_id === followedID

  return (
    <div className="canvas-page">
      <div className="topbar">
        <a href="/">← Pipelines</a>
        <h1>
          {detail.pipeline_name} · run #{detail.run.id}
        </h1>
        <span className={`badge ${detail.run.status}`}>{detail.run.status.replace('_', ' ')}</span>
        {typeof detail.run.context.issue_url === 'string' && (
          <a href={detail.run.context.issue_url} target="_blank" rel="noreferrer">
            {String(detail.run.context.issue_identifier ?? 'Linear issue')} ↗
          </a>
        )}
        <div className="spacer" />
        <Link to={`/pipelines/${detail.run.pipeline_config_id}`}>Edit pipeline</Link>
      </div>
      <div className="canvas-main">
        <div className="canvas-wrap">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            onNodeClick={(_, node) => setInspectedID(node.id)}
            colorMode="dark"
            fitView
          >
            <Background />
            <Controls showInteractive={false} />
            <GateLegend
              show={detail.graph.nodes.some((n) => n.type === 'approval' || n.type === 'linear_wait')}
            />
          </ReactFlow>
        </div>
        {inspectedRun && (
          <NodeInspector
            nodeRun={inspectedRun}
            name={inspectedName}
            live={inspectorLive}
            onClose={() => setInspectedID(null)}
          />
        )}
      </div>
      {waitingNode && <ResumePanel run={detail.run} node={waitingNode} />}
      <details className="context-details">
        <summary>Run context</summary>
        <pre>{JSON.stringify(detail.run.context, null, 2)}</pre>
      </details>
    </div>
  )
}
