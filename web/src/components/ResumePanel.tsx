import { useState } from 'react'
import { resumeRun } from '../api'
import type { GraphNode, Run } from '../types'

interface Props {
  run: Run
  node: GraphNode
}

export default function ResumePanel({ run, node }: Props) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (decision: string) => {
    setBusy(true)
    setError('')
    try {
      await resumeRun(run.id, decision, text)
      setText('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const inputValues = node.data.inputs
    .map((key) => ({ key, value: run.context[key] }))
    .filter((entry) => entry.value !== undefined)

  return (
    <div className="resume-panel">
      <h2>
        {node.data.name} is waiting for you
      </h2>
      {node.data.prompt && <div>{node.data.prompt}</div>}
      {inputValues.map(({ key, value }) => (
        <div key={key}>
          <label style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)' }}>{key}</label>
          <pre>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>
        </div>
      ))}
      {error && <div className="error-banner" style={{ margin: 0 }}>{error}</div>}
      {node.type === 'linear_wait' && (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>
          Watching the Linear issue: the next comment there resumes this run automatically. Or
          answer here instead.
        </div>
      )}
      {node.type === 'human_input' || node.type === 'linear_wait' ? (
        <>
          <textarea
            rows={3}
            placeholder="Your answer"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="resume-actions">
            <button className="primary" disabled={busy || !text.trim()} onClick={() => submit('')}>
              Submit
            </button>
          </div>
        </>
      ) : (
        <>
          <textarea
            rows={2}
            placeholder="Optional note (required context for request changes)"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="resume-actions">
            <button className="primary" disabled={busy} onClick={() => submit('approve')}>
              Approve
            </button>
            <button disabled={busy} onClick={() => submit('request_changes')}>
              Request changes
            </button>
            <button className="danger" disabled={busy} onClick={() => submit('reject')}>
              Reject
            </button>
          </div>
        </>
      )}
    </div>
  )
}
