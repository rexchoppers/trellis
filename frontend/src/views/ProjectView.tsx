import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { ForgetProject, ShowInFinder, StartJob } from '../../wailsjs/go/main/App';
import type { jobs, setup } from '../../wailsjs/go/models';
import { findAgent, jobTitle, stateLabel, useJobs } from '@/lib/jobs';
import { cn } from '@/lib/utils';
import type { AgentHit, View as OfficeView } from '../scenes/corporate-office/OfficeMap';
import { Conversation } from './Conversation';
import { Flow } from './Flow';
import { Tasks } from './Tasks';
import { CloseButton, message, Swatch } from './shared';
import { noDrag, TitleBar } from './TitleBar';

// three.js is large, so the office loads only when a project opens.
const OfficeMap = lazy(() => import('../scenes/corporate-office/OfficeMap'));

type ProjectViewProps = {
  project: setup.ProjectStatus;
  switcher: ReactNode;
  onRemoved: () => void;
};

type View = 'office' | 'tasks' | 'flow';

const NARROW = 900;

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < NARROW);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return narrow;
}

function Dispatch({
  projectPath,
  hit,
  name,
  colour,
  department,
  at,
  busy,
  onOpen,
  onClose,
}: {
  projectPath: string;
  hit: AgentHit;
  name: string;
  colour: string;
  department: string;
  at: { x: number; y: number };
  busy: jobs.Job[];
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [topic, setTopic] = useState('');
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    StartJob(projectPath, hit.department, hit.agent, topic)
      .then(onClose)
      .catch((err) => {
        setError(message(err));
        setSending(false);
      });
  };
  return (
    <form
      onSubmit={send}
      className="absolute z-10 grid w-[340px] max-w-[calc(100%-16px)] gap-3 bg-background p-4 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.55)]"
      style={{ left: `clamp(8px, ${at.x + 24}px, calc(100% - 348px))`, top: `clamp(8px, ${at.y - 50}px, calc(100% - 190px))` }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <span className="sign text-[26px] leading-none font-extrabold">{name}</span>
          <span className="sign text-[11px] text-muted-foreground">
            <Swatch colour={colour} />
            {department}
          </span>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      {busy.length > 0 && (
        <div className="grid gap-1 border-y py-2">
          <span className="sign text-[10px] text-muted-foreground">Working now</span>
          {busy.map((job) => (
            <button key={job.id} type="button" className="flex items-baseline justify-between gap-3 text-left text-[13px] hover:underline" onClick={() => onOpen(job.id)}>
              <span className="truncate">{jobTitle(job)}</span>
              <span className="sign shrink-0 text-[10px] text-[var(--working)]">
                {job.progress?.find((step) => step.status === 'active')?.name ?? stateLabel(job.state)} · Open →
              </span>
            </button>
          ))}
        </div>
      )}
      <label htmlFor="dispatch-task" className="sign text-[11px] text-muted-foreground">
        Task
      </label>
      <input
        id="dispatch-task"
        autoFocus
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        className="-mt-1.5 border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-muted-foreground"
      />
      <button type="submit" className="act justify-self-end" disabled={sending}>
        Send to {name} →
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

export function ProjectView({ project, switcher, onRemoved }: ProjectViewProps) {
  const [view, setView] = useState<View>('office');
  const [officeView, setOfficeView] = useState<OfficeView>('bird');
  const [dispatch, setDispatch] = useState<{ hit: AgentHit; at: { x: number; y: number } }>();
  const [open, setOpen] = useState<string>();
  const { jobs, departments } = useJobs(project.path);
  const narrow = useNarrow();

  if (project.missing) {
    return (
      <>
        <TitleBar>{switcher}</TitleBar>
        <div className="grid justify-items-start gap-3 px-6 py-8">
          <p className="sign text-2xl font-extrabold">{project.name}: folder not found</p>
          <p className="font-mono text-xs text-muted-foreground">{project.path}</p>
          <button type="button" className="act" onClick={() => ForgetProject(project.path).then(onRemoved)}>
            Remove from Trellis
          </button>
        </div>
      </>
    );
  }

  const job = open ? jobs.find((candidate) => candidate.id === open) : undefined;
  const who = job && findAgent(departments, job.department, job.agent);
  const free = view === 'office' && dispatch ? findAgent(departments, dispatch.hit.department, dispatch.hit.agent) : undefined;
  const needsYou = jobs.filter((candidate) => candidate.state === 'needs_you').length;
  const fullConversation = !!job && narrow;

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <TitleBar>
        {switcher}
        <nav className="flex h-full items-stretch gap-5" role="tablist" aria-label="View" style={noDrag}>
          {(['office', 'tasks', 'flow'] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={view === key}
              className={cn(
                'sign flex items-center gap-2 border-b-2 border-transparent text-[13px] font-semibold text-muted-foreground hover:text-foreground',
                view === key && 'border-foreground text-foreground',
              )}
              onClick={() => {
                setView(key);
                setDispatch(undefined);
                if (narrow) setOpen(undefined);
              }}
            >
              {key}
              {key === 'office' && needsYou > 0 && <span className="text-[var(--amber)] tabular-nums">{needsYou}</span>}
            </button>
          ))}
        </nav>
        <div className="sign ml-auto flex items-center gap-2.5 text-xs text-muted-foreground" style={noDrag}>
          {view === 'office' && !fullConversation && (
            <>
              <button type="button" aria-pressed={officeView === 'bird'} className={cn('hover:text-foreground', officeView === 'bird' && 'text-foreground')} onClick={() => setOfficeView('bird')}>
                Bird's eye
              </button>
              <span aria-hidden>·</span>
              <button type="button" aria-pressed={officeView === 'desk'} className={cn('hover:text-foreground', officeView === 'desk' && 'text-foreground')} onClick={() => setOfficeView('desk')}>
                At your desk
              </button>
            </>
          )}
          <button type="button" className="ml-3 hidden hover:text-foreground lg:block" onClick={() => ShowInFinder(`${project.path}/.trellis`)}>
            Open .trellis
          </button>
        </div>
      </TitleBar>

      <div className="flex min-h-0 flex-1">
        <div className={cn('relative min-w-0 flex-1', fullConversation && 'hidden')}>
          <Suspense fallback={<div className="absolute inset-0 bg-[#cfc8b8]" />}>
            <OfficeMap
              departments={departments}
              jobs={jobs}
              view={officeView}
              places={project.places}
              npcs={project.npcs}
              onAgent={(hit, at) => {
                if (hit.run) {
                  setDispatch(undefined);
                  setOpen(hit.run);
                } else setDispatch({ hit, at });
              }}
            />
          </Suspense>
          {departments.length === 0 && view === 'office' && (
            <p className="absolute top-4 left-4 bg-background px-3 py-2 text-sm">
              No departments yet. Add one under <code className="font-mono text-xs">.trellis/departments</code>.
            </p>
          )}
          {view === 'tasks' && <Tasks departments={departments} list={jobs} open={open} onOpen={setOpen} />}
          {view === 'flow' && <Flow departments={departments} />}
          {dispatch && free?.d && free.a && (
            <Dispatch
              key={`${dispatch.hit.department}/${dispatch.hit.agent}`}
              projectPath={project.path}
              hit={dispatch.hit}
              name={free.a.name}
              colour={free.d.colour}
              department={free.d.name}
              at={dispatch.at}
              busy={jobs.filter(
                (candidate) => candidate.department === dispatch.hit.department && candidate.agent === dispatch.hit.agent && (candidate.state === 'working' || candidate.state === 'needs_you'),
              )}
              onOpen={(id) => {
                setDispatch(undefined);
                setOpen(id);
              }}
              onClose={() => setDispatch(undefined)}
            />
          )}
        </div>
        {job && (
          <div className={cn('flex min-w-0 border-l', fullConversation ? 'flex-1' : 'w-[480px] shrink-0')}>
            <Conversation
              projectPath={project.path}
              job={job}
              who={{ name: who?.a?.name ?? job.agent, colour: who?.d?.colour ?? '#888', department: who?.d?.name ?? job.department }}
              agent={who?.a}
              departments={departments}
              back={narrow ? (view === 'office' ? 'Office' : 'Tasks') : undefined}
              onClose={() => setOpen(undefined)}
              onOpenJob={setOpen}
            />
          </div>
        )}
      </div>
    </div>
  );
}
