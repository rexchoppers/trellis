import type { jobs } from '../../../wailsjs/go/models';
import { jobTitle, stateLabel } from '@/lib/jobs';
import { cn } from '@/lib/utils';
import { CloseButton, Swatch } from '../shared';

export type Who = { name: string; colour: string; department: string };

function Tracker({ steps, working }: { steps: jobs.Step[]; working: boolean }) {
  const current = steps.find((step) => step.status === 'active');
  const last = [...steps].reverse().find((step) => step.status === 'done' && step.note);
  return (
    <div className="mt-1 grid gap-1">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {steps.map((step, i) => (
          <li key={step.name} className="flex items-center gap-1.5" title={step.note || undefined}>
            {i > 0 && <span className="text-[10px] text-muted-foreground">·</span>}
            <span
              className={cn(
                'sign text-[11px]',
                step.status === 'done' && 'text-foreground',
                step.status === 'active' && 'font-bold text-[var(--working)]',
                step.status === 'pending' && 'text-muted-foreground',
                step.status === 'skipped' && 'text-muted-foreground line-through',
              )}
            >
              {step.status === 'done' && '✓ '}
              {step.status === 'active' && working && <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-[var(--working)] align-middle" />}
              {step.name}
            </span>
          </li>
        ))}
      </ol>
      {(current?.note || last?.note) && <p className="text-xs text-[#c9c9c2]">{current?.note || last?.note}</p>}
    </div>
  );
}

export function Header({ job, who, back, onClose, onOpenJob }: { job: jobs.Job; who: Who; back?: string; onClose: () => void; onOpenJob?: (id: string) => void }) {
  return (
    <header className="grid gap-1.5 border-b px-5 pt-4 pb-3.5">
      {back && (
        <button type="button" className="sign justify-self-start text-[11px] text-muted-foreground hover:text-foreground" onClick={onClose}>
          ← {back}
        </button>
      )}
      <div className="flex items-start justify-between gap-3">
        <span className="sign text-[30px] leading-none font-extrabold">{who.name}</span>
        {!back && <CloseButton onClick={onClose} />}
      </div>
      <span className="sign text-[11px] text-muted-foreground">
        <Swatch colour={who.colour} />
        {who.department} · <span className={cn(job.state === 'needs_you' && 'text-[var(--amber)]', job.state === 'working' && 'text-[var(--working)]')}>{stateLabel(job.state)}</span>
      </span>
      {job.parent ? (
        <button type="button" className="justify-self-start text-left text-[13px] text-[#c9c9c2] hover:text-foreground" onClick={() => onOpenJob?.(job.parent!.job)}>
          Started by {job.parent.name} · {job.task} →
        </button>
      ) : (
        <span className="text-[13px] text-[#c9c9c2]">{jobTitle(job)}</span>
      )}
      {(job.children ?? []).length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {job.children.map((child) => (
            <button key={child.job} type="button" className="sign text-[11px] text-muted-foreground hover:text-foreground" onClick={() => onOpenJob?.(child.job)}>
              {child.name} {child.job.slice(-6)} →
            </button>
          ))}
        </div>
      )}
      {job.branch && <span className="font-mono text-[11px] text-muted-foreground">{job.branch}</span>}
      {(job.progress ?? []).length > 0 && <Tracker steps={job.progress} working={job.state === 'working'} />}
    </header>
  );
}
