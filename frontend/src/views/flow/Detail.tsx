import { can, outcomeOf, type Edge, type Node } from '@/lib/flow';
import { CloseButton } from '../shared';

// A delegation carries no event of its own, so it has no payload.
export function Detail({ edge, from, to, onClose }: { edge: Edge; from: Node; to: Node; onClose: () => void }) {
  const outcome = outcomeOf(from, edge);
  const fixed = Object.entries(outcome?.with ?? {});
  const given = Object.entries(outcome?.fields ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const example = JSON.stringify(
    {
      id: 'J-20261006-101500-001',
      name: edge.event,
      at: '2026-10-06T10:15:00Z',
      from: { event: edge.event, job: '<the job that finished>', agent: from.agent.name, department: from.department.name },
      data: Object.fromEntries([...fixed, ...given.map(([key, about]) => [key, `<${about}>`])].sort(([a], [b]) => a.localeCompare(b))),
      started: [`<${to.agent.name}'s new job>`],
    },
    null,
    2,
  );
  return (
    <aside className="absolute inset-y-0 right-0 z-10 flex w-[380px] max-w-full flex-col overflow-y-auto border-l bg-background">
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="grid gap-1">
          <span className="font-mono text-sm">{edge.event}</span>
          <span className="sign text-[11px] text-muted-foreground">
            {from.agent.name}
            {outcome && ` · ${outcome.label || outcome.name}`} → {to.agent.name}
          </span>
        </div>
        <CloseButton onClick={onClose} />
      </header>
      {!edge.delegate && (
        <section className="grid gap-2 border-b px-5 py-4">
          <h3 className="sign text-[11px] font-bold text-muted-foreground">Payload</h3>
          {fixed.length + given.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing declared. Add fields to this outcome to say what it carries.</p>
          ) : (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
              {fixed.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="font-mono text-xs">{key}</dt>
                  <dd>
                    <span className="font-mono text-xs">{value}</span> <span className="text-xs text-muted-foreground">always</span>
                  </dd>
                </div>
              ))}
              {given.map(([key, about]) => (
                <div key={key} className="contents">
                  <dt className="font-mono text-xs">{key}</dt>
                  <dd className="text-[#c9c9c2]">{about}</dd>
                </div>
              ))}
            </dl>
          )}
          {given.length > 0 && <p className="text-xs text-muted-foreground">{from.agent.name} must fill every field before the job can finish.</p>}
        </section>
      )}
      {!edge.back && !edge.delegate && (
        <section className="grid gap-2 border-b px-5 py-4">
          <h3 className="sign text-[11px] font-bold text-muted-foreground">As JSON</h3>
          <pre className="overflow-x-auto bg-card p-3 font-mono text-[11px] leading-relaxed text-[#c9c9c2]">{example}</pre>
          <p className="text-xs text-muted-foreground">What Trellis records in .trellis/jobs/events.jsonl. Values in angle brackets are filled in by {from.agent.name}.</p>
        </section>
      )}
      <section className="grid gap-2 border-b px-5 py-4">
        <h3 className="sign text-[11px] font-bold text-muted-foreground">Then</h3>
        {edge.delegate ? (
          <p className="text-sm">
            {from.agent.name} can start jobs for {to.agent.name}. Each of those jobs reports back to {from.agent.name} when it checks in, finishes or fails
            {edge.filter ? `, and ${from.agent.name} ${edge.filter}` : ''}.
          </p>
        ) : edge.back ? (
          <p className="text-sm">{to.agent.name}'s original job reopens in its own session, with these fields as the message, so they pick up their own work again.</p>
        ) : (
          <p className="text-sm">
            {to.agent.name} starts a job straight away{edge.filter ? `, when ${edge.filter}` : ''}
            {edge.maybe ? ' (depends on the data)' : ''}.
          </p>
        )}
        {to.agent.task && <p className="text-sm text-[#c9c9c2]">{to.agent.task}</p>}
        {(to.agent.steps ?? []).length > 0 && (
          <ol className="grid list-decimal gap-0.5 pl-5 text-sm">
            {(to.agent.steps ?? []).map((step) => (
              <li key={step.name}>{step.name}</li>
            ))}
          </ol>
        )}
        <p className="font-mono text-[11px] text-muted-foreground">{can(to.agent)}</p>
      </section>
    </aside>
  );
}
