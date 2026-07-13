import type { Graph, Pipeline, PipelineListItem, Run, RunDetail } from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body.error) message = body.error
    } catch {
      // non-JSON error body, keep the status text
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const listPipelines = () => request<PipelineListItem[]>('/api/pipelines')

export const createPipeline = (name: string, description: string) =>
  request<Pipeline>('/api/pipelines', post({ name, description }))

export const getPipeline = (id: number | string) => request<Pipeline>(`/api/pipelines/${id}`)

export const updatePipeline = (
  id: number | string,
  name: string,
  description: string,
  workdir: string,
  graph: Graph,
) => request<Pipeline>(`/api/pipelines/${id}`, { ...post({ name, description, workdir, graph }), method: 'PUT' })

export const deletePipeline = (id: number) => request<void>(`/api/pipelines/${id}`, { method: 'DELETE' })

export const listRuns = (pipelineId: number | string) => request<Run[]>(`/api/pipelines/${pipelineId}/runs`)

export const startRun = (pipelineId: number | string, linearIssue = '') =>
  request<Run>('/api/runs', post({ pipeline_id: Number(pipelineId), linear_issue: linearIssue }))

export const getRun = (id: number | string) => request<RunDetail>(`/api/runs/${id}`)

export const resumeRun = (id: number | string, decision: string, response: string) =>
  request<{ status: string }>(`/api/runs/${id}/resume`, post({ decision, response }))
