import { countBy } from 'es-toolkit';
import { useState } from 'react';
import type { config, jobs } from '../../wailsjs/go/models';
import { findAgent, jobTask, STATES, stateLabel } from '@/lib/jobs';
import { cn } from '@/lib/utils';
import { Select, Stat, Swatch } from './shared';

const WEEK = 7 * 24 * 60 * 60 * 1000;

const ago = (value: string) => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

function Produced({ items }: { items: jobs.Produced[] }) {
  if (!items?.length) return <span className="text-muted-foreground">–</span>;
  const shown = items.slice(0, 4);
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
      {shown.map((item) =>
        item.url ? (
          <a key={`${item.kind}-${item.label}`} href={item.url} target="_blank" rel="noreferrer" className="underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
            {item.label}
          </a>
        ) : (
          <span key={`${item.kind}-${item.label}`} className={cn(item.kind === 'file' && 'font-mono text-xs text-[#c9c9c2]')}>
            {item.label}
          </span>
        ),
      )}
      {items.length > shown.length && <span className="text-muted-foreground">+{items.length - shown.length}</span>}
    </span>
  );
}

const th = 'sign sticky top-0 border-b bg-background px-4 py-2.5 text-left text-[11px] font-semibold tracking-[0.08em] text-muted-foreground';
const td = 'border-b border-[#1f1f1d] px-4 py-3.5 align-top';

export function Tasks({ departments, list, open, onOpen }: { departments: config.Department[]; list: jobs.Job[]; open?: string; onOpen: (id: string) => void }) {
  const [filters, setFilters] = useState({ department: '', agent: '', state: '' });
  const rows = list.filter(
    (job) =>
      (!filters.department || job.department === filters.department) && (!filters.agent || `${job.department}/${job.agent}` === filters.agent) && (!filters.state || job.state === filters.state),
  );
  const count = countBy(list, (job) => job.state);
  const needsYou = count.needs_you ?? 0;
  const totals = [
    { label: 'Working', value: count.working ?? 0, tone: '' },
    { label: 'Needs you', value: needsYou, tone: needsYou ? 'text-[var(--amber)]' : '' },
    { label: 'Done this week', value: list.filter((job) => job.state === 'done' && Date.now() - new Date(job.created).getTime() < WEEK).length, tone: '' },
  ];
  const set = (key: keyof typeof filters) => (value: string) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      <div className="flex flex-wrap items-end gap-x-14 gap-y-4 border-b px-8 pt-6 pb-5">
        {totals.map((total) => (
          <Stat key={total.label} {...total} />
        ))}
        <div className="sign ml-auto flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <Select
            id="filter-department"
            label="Department"
            value={filters.department}
            onChange={set('department')}
            options={[['', 'All'], ...departments.map((d): [string, string] => [d.key, d.name])]}
          />
          <Select
            id="filter-agent"
            label="Agent"
            value={filters.agent}
            onChange={set('agent')}
            options={[['', 'All'], ...departments.flatMap((d) => (d.agents ?? []).map((a): [string, string] => [`${d.key}/${a.key}`, a.name]))]}
          />
          <Select id="filter-status" label="Status" value={filters.state} onChange={set('state')} options={[['', 'Any'], ...Object.entries(STATES).map(([v, state]): [string, string] => [v, state.label])]} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{list.length === 0 ? 'No jobs yet. Click an agent in the office to give them one.' : 'No jobs match.'}</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>Agent</th>
                <th className={cn(th, 'hidden lg:table-cell')}>Department</th>
                <th className={th}>Task</th>
                <th className={th}>Status</th>
                <th className={th}>Produced</th>
                <th className={cn(th, 'hidden text-right sm:table-cell')}>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((job) => {
                const { d, a } = findAgent(departments, job.department, job.agent);
                return (
                  <tr
                    key={job.id}
                    tabIndex={0}
                    className={cn('cursor-pointer hover:bg-[#151514]', open === job.id && 'bg-[#151514]')}
                    onClick={() => onOpen(job.id)}
                    onKeyDown={(e) => e.key === 'Enter' && onOpen(job.id)}
                  >
                    <td className={cn(td, 'font-semibold whitespace-nowrap')}>{a?.name ?? job.agent}</td>
                    <td className={cn(td, 'sign hidden text-xs whitespace-nowrap lg:table-cell')}>
                      <Swatch colour={d?.colour} />
                      {d?.name ?? job.department}
                    </td>
                    <td className={td}>
                      {job.from && <span className="sign mr-2 text-[11px] text-muted-foreground">← {job.from.agent}</span>}
                      {jobTask(job)}
                    </td>
                    <td className={cn(td, 'sign text-xs font-bold whitespace-nowrap', STATES[job.state]?.tone)}>{stateLabel(job.state)}</td>
                    <td className={cn(td, 'max-w-72')}>
                      <Produced items={job.produced} />
                    </td>
                    <td className={cn(td, 'hidden text-right whitespace-nowrap text-muted-foreground sm:table-cell')}>{ago(job.created)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
