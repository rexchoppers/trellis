import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPipeline, deletePipeline, listPipelines, listRuns, startRun } from '../api'
import type { PipelineListItem, Run } from '../types'

const timeAgo = (timestamp: string) => {
  const then = new Date(timestamp.replace(' ', 'T') + 'Z').getTime()
  const minutes = Math.floor((Date.now() - then) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function Home() {
  const [pipelines, setPipelines] = useState<PipelineListItem[]>([])
  const [selectedID, setSelectedID] = useState<number | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [issue, setIssue] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const refresh = () =>
    listPipelines()
      .then((items) => {
        setPipelines(items)
        setSelectedID((current) =>
          current !== null && items.some((p) => p.id === current) ? current : (items[0]?.id ?? null),
        )
      })
      .catch((e) => setError(e.message))

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedID === null) {
      setRuns([])
      return
    }
    setIssue('')
    listRuns(selectedID)
      .then(setRuns)
      .catch((e) => setError(e.message))
  }, [selectedID])

  const selected = pipelines.find((p) => p.id === selectedID) ?? null

  const create = async () => {
    if (!newName.trim()) return
    try {
      const pipeline = await createPipeline(newName.trim(), '')
      navigate(`/pipelines/${pipeline.id}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const run = async () => {
    if (!selected) return
    setError('')
    try {
      const r = await startRun(selected.id, issue.trim())
      navigate(`/runs/${r.id}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async () => {
    if (!selected || !confirm(`Delete pipeline "${selected.name}" and all of its runs?`)) return
    try {
      await deletePipeline(selected.id)
      setSelectedID(null)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="home-split">
      <div className="home-sidebar">
        <h1>Trellis</h1>
        {pipelines.map((p) => (
          <div
            key={p.id}
            className={`home-side-item ${p.id === selectedID ? 'active' : ''}`}
            onClick={() => setSelectedID(p.id)}
          >
            <span className={`status-dot ${p.last_run_status ?? 'pending'}`} />
            <span className="home-side-name">{p.name}</span>
          </div>
        ))}
        {creating ? (
          <div className="home-side-create">
            <input
              autoFocus
              placeholder="Pipeline name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') create()
                if (e.key === 'Escape') setCreating(false)
              }}
            />
            <button className="primary" onClick={create}>
              Create
            </button>
          </div>
        ) : (
          <button className="primary home-side-new" onClick={() => setCreating(true)}>
            + New pipeline
          </button>
        )}
      </div>

      <div className="home-main">
        {error && <div className="error-banner" style={{ margin: '0 0 16px' }}>{error}</div>}
        {!selected ? (
          <div className="empty-state">No pipelines yet. Create one to get started.</div>
        ) : (
          <>
            <div className="home-title">
              <h2>{selected.name}</h2>
              <span className="home-title-actions">
                <button onClick={() => navigate(`/pipelines/${selected.id}`)}>Edit pipeline</button>
                <button className="danger" onClick={remove}>
                  Delete
                </button>
              </span>
            </div>
            <p className="home-desc">{selected.description || 'No description'}</p>
            {selected.workdir && <p className="home-desc">Works in: {selected.workdir}</p>}

            <div className="home-launcher">
              <label>Run with a Linear issue</label>
              <div className="home-launch-row">
                <input
                  placeholder="TRA-123 or https://linear.app/…"
                  value={issue}
                  onChange={(e) => setIssue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && run()}
                />
                <button className="primary" onClick={run}>
                  Run pipeline
                </button>
              </div>
            </div>

            <div className="home-runs">
              <label>Runs</label>
              {runs.length === 0 ? (
                <div className="home-runs-empty">No runs yet.</div>
              ) : (
                runs.map((r) => (
                  <div key={r.id} className="home-run" onClick={() => navigate(`/runs/${r.id}`)}>
                    <span className="home-run-id">#{r.id}</span>
                    <span className="home-run-issue">
                      {typeof r.context.issue_identifier === 'string' ? r.context.issue_identifier : '—'}
                    </span>
                    <span className={`badge ${r.status}`}>{r.status.replace('_', ' ')}</span>
                    <span className="home-run-when">{timeAgo(r.created_at)}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
