import { Panel } from '@xyflow/react'

export default function GateLegend({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <Panel position="bottom-left" className="gate-legend">
      <span>
        <span className="legend-line approved" /> approved
      </span>
      <span>
        <span className="legend-line changes" /> changes requested
      </span>
    </Panel>
  )
}
