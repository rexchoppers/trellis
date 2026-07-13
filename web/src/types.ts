export type NodeType = 'agent' | 'human_input' | 'approval' | 'action' | 'linear_wait'

// Display names; the stored type strings never change.
export const nodeTypeLabel = (type: string) =>
  type === 'linear_wait' ? 'human feedback' : type.replace('_', ' ')
export type Status = 'pending' | 'running' | 'waiting_human' | 'done' | 'failed'

export interface NodeData {
  name: string
  prompt: string
  inputs: string[]
  outputs: string[]
  tools?: string
  model?: string
  action?: string
  params?: Record<string, string>
  [key: string]: unknown
}

export interface GraphNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  data: NodeData
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface Pipeline {
  id: number
  name: string
  description: string
  workdir: string
  graph: Graph
  created_at: string
  updated_at: string
}

export interface PipelineListItem {
  id: number
  name: string
  description: string
  workdir: string
  last_run_id: number | null
  last_run_status: Status | null
  updated_at: string
}

export interface Run {
  id: number
  pipeline_config_id: number
  status: Status
  current_node_id: string
  context: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface NodeRun {
  id: number
  pipeline_run_id: number
  node_id: string
  node_type: NodeType
  status: Status
  input: Record<string, unknown>
  output: Record<string, unknown>
  log: string
  created_at: string
  updated_at: string
}

export interface RunDetail {
  run: Run
  node_runs: NodeRun[]
  graph: Graph
  pipeline_name: string
}
