import { useCallback, useEffect, useRef, useState } from 'react';
import { Departments, Jobs, Thread } from '../../wailsjs/go/main/App';
import type { config, jobs } from '../../wailsjs/go/models';
import { EventsOn } from '../../wailsjs/runtime/runtime';

type JobChanged = { path: string; id: string };

// Calls fn on "job" events for this project, at most a few times a second.
function useJobEvents(projectPath: string, fn: (id: string) => void) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = EventsOn('job', (event: JobChanged) => {
      if (event.path !== projectPath) return;
      pending.add(event.id);
      timer ??= setTimeout(() => {
        timer = undefined;
        for (const id of pending) latest.current(id);
        pending.clear();
      }, 150);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [projectPath]);
}

// Departments are hand-edited files, so they are also re-read on window focus.
export function useJobs(projectPath: string) {
  const [list, setList] = useState<jobs.Job[]>([]);
  const [departments, setDepartments] = useState<config.Department[]>([]);
  const refresh = useCallback(() => {
    Jobs(projectPath)
      .then(setList)
      .catch(() => undefined);
  }, [projectPath]);
  const reread = useCallback(() => {
    Departments(projectPath)
      .then(setDepartments)
      .catch(() => undefined);
  }, [projectPath]);
  useEffect(() => {
    refresh();
    reread();
    const onFocus = () => {
      refresh();
      reread();
    };
    window.addEventListener('focus', onFocus);
    // Events can miss a job run by another Trellis window, so the list is also re-read every few seconds.
    const timer = setInterval(refresh, 3000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(timer);
    };
  }, [refresh, reread]);
  useJobEvents(projectPath, refresh);
  return { jobs: list, departments };
}

export function useThread(projectPath: string, id?: string) {
  const [thread, setThread] = useState<jobs.Entry[]>([]);
  const load = useCallback(() => {
    if (id)
      Thread(projectPath, id)
        .then(setThread)
        .catch(() => undefined);
  }, [projectPath, id]);
  useEffect(() => {
    setThread([]);
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);
  useJobEvents(projectPath, (changed) => changed === id && load());
  return thread;
}

export const STATES: Record<string, { label: string; tone: string }> = {
  working: { label: 'Working', tone: 'text-[var(--working)]' },
  needs_you: { label: 'Needs you', tone: 'text-[var(--amber)]' },
  waiting: { label: 'Resting', tone: 'text-muted-foreground' },
  done: { label: 'Done', tone: 'text-muted-foreground' },
  failed: { label: 'Failed', tone: 'text-destructive' },
  cancelled: { label: 'Cancelled', tone: 'text-muted-foreground' },
};

export const stateLabel = (state: string) => STATES[state]?.label ?? state;

export const live = (job: jobs.Job) => job.state === 'working' || job.state === 'needs_you' || job.state === 'waiting';

// The PR the job opened: Trellis's own, one the agent recorded, or one named in its outcome.
export function pullOf(job: jobs.Job) {
  const found = [job.pr, ...(job.produced ?? []).filter((p) => p.kind === 'pr').map((p) => p.url), ...Object.values(job.data ?? {})]
    .map((text) => text?.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)/))
    .find(Boolean);
  return found ? { url: found[0], number: found[1] } : undefined;
}

export const jobTask = (job: jobs.Job) => job.task.split('\n')[0] || 'Their choice';

export const jobTitle = (job: jobs.Job) => (job.from ? `From ${job.from.agent} · ${job.from.event}` : jobTask(job));

export function findAgent(departments: config.Department[], department: string, agent: string) {
  const d = departments.find((candidate) => candidate.key === department);
  return { d, a: d?.agents?.find((candidate) => candidate.key === agent) };
}
