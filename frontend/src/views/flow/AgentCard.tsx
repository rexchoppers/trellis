import { can, CARD_W, describe, HEAD_H, LISTEN_H, ROW_H, STEP_H, stepH, type Edge, type Node } from '@/lib/flow';
import { cn } from '@/lib/utils';

// Row heights use lib/flow geometry so rows line up with where the arrows leave.
export function AgentCard({ node, edges, focused, onFocus }: { node: Node; edges: Edge[]; focused: boolean; onFocus: (key?: string) => void }) {
  const outcomes = node.agent.outcomes ?? [];
  const listens = node.agent.listens ?? [];
  const steps = node.agent.steps ?? [];
  const loose = !outcomes.length && !listens.length && !(node.agent.delegates ?? []).length;
  return (
    <section
      className={cn('absolute border bg-card', loose && 'opacity-50', focused && 'border-foreground')}
      style={{ left: node.x, top: node.y, width: CARD_W, height: node.h }}
      title={can(node.agent)}
      onMouseEnter={() => onFocus(node.key)}
      onMouseLeave={() => onFocus(undefined)}
    >
      <header className="flex flex-col justify-center gap-0.5 border-b px-3" style={{ height: HEAD_H, boxShadow: `inset 3px 0 0 ${node.department.colour}` }}>
        <span className="sign text-[18px] leading-none font-extrabold">{node.agent.name}</span>
        <span className="sign truncate text-[10px] text-muted-foreground">
          {node.department.name}
          {node.agent.task ? ` · ${node.agent.task}` : ''}
        </span>
      </header>
      {steps.length > 0 && (
        <ol className="border-b px-3 py-[5px]" style={{ height: node.stepsH }}>
          {steps.map((step, i) => (
            <li key={step.name} className="grid text-[11px]" style={{ height: stepH(step) }}>
              <span className="truncate" style={{ lineHeight: `${STEP_H}px` }}>
                <span className="mr-1.5 font-mono text-muted-foreground">{i + 1}</span>
                {step.name}
              </span>
              {(step.tools ?? []).length > 0 && <span className="-mt-1 truncate pl-4 font-mono text-[10px] text-muted-foreground">only here: {(step.tools ?? []).join(', ')}</span>}
            </li>
          ))}
        </ol>
      )}
      {outcomes.length === 0 ? (
        <p className="sign px-3 text-[10px] text-muted-foreground" style={{ lineHeight: `${ROW_H}px` }}>
          No outcomes
        </p>
      ) : (
        outcomes.map((outcome, index) => {
          const sends = outcome.publish || outcome.back;
          const heard = edges.some((e) => e.from === node.key && e.outcome === index);
          return (
            <p key={outcome.name} className="flex items-center justify-between gap-2 px-3 text-[12px]" style={{ height: ROW_H }}>
              <span className="truncate">{outcome.label || outcome.name}</span>
              <span className={cn('shrink-0 font-mono text-[10px]', !sends ? 'text-muted-foreground' : heard ? 'text-foreground' : 'text-[var(--amber)]')}>
                {!sends ? 'ends' : !heard ? 'nobody' : outcome.back ? '↩' : '→'}
              </span>
            </p>
          );
        })
      )}
      {listens.map((listen, i) => (
        <p key={i} className="truncate border-t px-3 font-mono text-[10px] text-muted-foreground" style={{ lineHeight: `${LISTEN_H}px` }}>
          listens {listen.event}
          {Object.keys(listen.when ?? {}).length ? ` · ${describe(listen.when)}` : ''}
        </p>
      ))}
    </section>
  );
}
