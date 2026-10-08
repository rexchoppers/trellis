import { useMemo, useState } from 'react';
import type { config } from '../../wailsjs/go/models';
import { layout, outcomeOf, route, wire, type Edge } from '@/lib/flow';
import { cn } from '@/lib/utils';
import { AgentCard } from './flow/AgentCard';
import { Detail } from './flow/Detail';
import { usePanZoom } from './flow/usePanZoom';
import { Stat } from './shared';

export function Flow({ departments }: { departments: config.Department[] }) {
  const { agents, edges, problems } = useMemo(() => wire(departments), [departments]);
  const { nodes, width, height } = useMemo(() => layout(agents, edges), [agents, edges]);
  const [focus, setFocus] = useState<string>();
  const [picked, setPicked] = useState<number>();
  const { box, view, fit, grabbing, handlers } = usePanZoom(width);
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const chosen = picked !== undefined ? edges[picked] : undefined;
  const routes = useMemo(() => route(nodes, edges), [edges, nodes]);
  const lit = (edge: Edge, i: number) => picked === i || (picked === undefined && (!focus || focus === edge.from || focus === edge.to));

  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-start gap-x-10 gap-y-2 border-b px-8 py-4">
        <Stat value={edges.length} label="Hand-offs" />
        <Stat value={problems.length} label="Problems" tone={problems.length > 0 && 'text-[var(--amber)]'} />
        {problems.length > 0 && (
          <ul className="grid min-w-0 flex-1 gap-1 self-center text-sm text-[var(--amber)]">
            {problems.map((p) => (
              <li key={p.text}>{p.text}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={box} className={cn('absolute inset-0 touch-none overflow-hidden select-none', grabbing ? 'cursor-grabbing' : 'cursor-grab')} {...handlers}>
          {agents.length === 0 ? (
            <p className="px-8 py-6 text-sm text-muted-foreground">No agents yet.</p>
          ) : (
            <>
              <div className="absolute top-0 left-0 origin-top-left" style={{ width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
                <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
                  <defs>
                    <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                      <path d="M0 0 L10 5 L0 10 z" fill="#f2f2ee" />
                    </marker>
                  </defs>
                  {edges.map((edge, i) => {
                    const { d } = routes[i];
                    if (!d) return null;
                    return (
                      <path key={i} d={d} fill="none" stroke="#f2f2ee" strokeOpacity={lit(edge, i) ? 0.9 : 0.15} strokeWidth={2} strokeDasharray={edge.maybe ? '6 5' : undefined} markerEnd="url(#flow-arrow)" />
                    );
                  })}
                </svg>

                {edges.map((edge, i) => {
                  const from = byKey.get(edge.from);
                  const to = byKey.get(edge.to);
                  if (!from || !to) return null;
                  const fields = Object.keys(outcomeOf(from, edge)?.fields ?? {}).sort();
                  const { x, y } = routes[i];
                  return (
                    <button
                      type="button"
                      key={`label-${i}`}
                      className={cn(
                        'absolute w-[190px] -translate-x-1/2 -translate-y-1/2 border bg-background px-2 py-1 text-center hover:border-foreground',
                        picked === i && 'border-foreground',
                        !lit(edge, i) && 'opacity-20',
                      )}
                      style={{ left: x, top: y }}
                      onClick={() => setPicked(picked === i ? undefined : i)}
                    >
                      <span className="block font-mono text-[11px] whitespace-nowrap">{edge.event}</span>
                      {edge.filter && <span className="sign block text-[10px] whitespace-nowrap text-muted-foreground">{edge.filter}</span>}
                      {fields.length > 0 && <span className="block font-mono text-[10px] leading-snug text-[#c9c9c2]">{fields.join(' · ')}</span>}
                    </button>
                  );
                })}

                {nodes.map((node) => (
                  <AgentCard key={node.key} node={node} edges={edges} focused={focus === node.key} onFocus={setFocus} />
                ))}
              </div>
            </>
          )}
        </div>
        {agents.length > 0 && (
          <button type="button" className="sign absolute bottom-4 left-4 border bg-background px-3 py-1.5 text-[11px] hover:border-foreground" onClick={fit}>
            Fit
          </button>
        )}
        {chosen && byKey.get(chosen.from) && byKey.get(chosen.to) && <Detail edge={chosen} from={byKey.get(chosen.from)!} to={byKey.get(chosen.to)!} onClose={() => setPicked(undefined)} />}
      </div>
    </div>
  );
}
