import { useEffect, useState } from 'react';
import { OpenPulls, ReviewComments } from '../../wailsjs/go/main/App';
import type { config, jobs } from '../../wailsjs/go/models';
import { findAgent, jobTask, live, pullOf, stateLabel } from '@/lib/jobs';
import { cn } from '@/lib/utils';
import { message, Swatch } from './shared';

const th = 'sign sticky top-0 border-b bg-background px-4 py-2.5 text-left text-[11px] font-semibold tracking-[0.08em] text-muted-foreground';
const td = 'border-b border-[#1f1f1d] px-4 py-3.5 align-top';

export function PRs({ projectPath, departments, list, open, onOpen }: { projectPath: string; departments: config.Department[]; list: jobs.Job[]; open?: string; onOpen: (id: string) => void }) {
  const [sending, setSending] = useState<string>();
  const [results, setResults] = useState<Record<string, { text: string; failed: boolean }>>({});

  // Only agents that work on branches open PRs; a reviewer like Quinn carries the link but doesn't own it.
  const rows = new Map<string, { job: jobs.Job; pr: { url: string; number: string } }>();
  for (const job of list) {
    const pr = pullOf(job);
    const { a } = findAgent(departments, job.department, job.agent);
    if (!pr || !a?.worktree || rows.has(pr.url)) continue;
    rows.set(pr.url, { job, pr });
  }

  // Only PRs still open on GitHub; checked again every minute, so merged ones drop off.
  const urls = [...rows.keys()];
  const key = urls.join(' ');
  const [openOn, setOpenOn] = useState<Record<string, boolean>>();
  const [checkFailed, setCheckFailed] = useState<string>();
  useEffect(() => {
    if (!urls.length) return undefined;
    let alive = true;
    const check = () =>
      OpenPulls(projectPath, urls)
        .then((states) => alive && (setOpenOn(states), setCheckFailed(undefined)))
        .catch((err) => alive && setCheckFailed(message(err)));
    check();
    const timer = setInterval(check, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [projectPath, key]);
  const shown = [...rows.values()].filter(({ pr }) => openOn?.[pr.url]);

  const rerun = (job: jobs.Job, pr: { url: string; number: string }) => {
    setSending(job.id);
    ReviewComments(projectPath, job.id)
      .then(() => setResults((r) => ({ ...r, [pr.url]: { text: 'Sent to the agent', failed: false } })))
      .catch((err) => setResults((r) => ({ ...r, [pr.url]: { text: message(err), failed: true } })))
      .finally(() => setSending(undefined));
  };

  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto bg-background">
      <p className="border-b px-8 py-5 text-sm text-[#c9c9c2]">
        Review a PR on GitHub, then send its open comments back to the agent that made it. It fixes them in the same job, replies on each thread and resolves it.
      </p>
      {checkFailed && <p className="px-8 pt-4 text-sm text-destructive">Couldn't check GitHub: {checkFailed}</p>}
      {!openOn && !checkFailed && rows.size > 0 ? (
        <p className="px-8 py-6 text-sm text-muted-foreground">
          <span className="working-dots">Checking GitHub for open PRs</span>
        </p>
      ) : shown.length === 0 ? (
        <p className="px-8 py-6 text-sm text-muted-foreground">No open PRs from agents.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={th}>PR</th>
              <th className={th}>Task</th>
              <th className={th}>Agent</th>
              <th className={th}>Status</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {shown.map(({ job, pr }) => {
              const { d, a } = findAgent(departments, job.department, job.agent);
              const result = results[pr.url];
              return (
                <tr key={pr.url} className={cn('cursor-pointer hover:bg-[#141413]', open === job.id && 'bg-[#141413]')} onClick={() => onOpen(job.id)}>
                  <td className={td}>
                    <a href={pr.url} target="_blank" rel="noreferrer" className="underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
                      #{pr.number}
                    </a>
                  </td>
                  <td className={td}>{jobTask(job)}</td>
                  <td className={cn(td, 'whitespace-nowrap')}>
                    <Swatch colour={d?.colour} />
                    {a?.name ?? job.agent}
                  </td>
                  <td className={cn(td, 'sign text-[11px] whitespace-nowrap text-muted-foreground')}>{stateLabel(job.state)}</td>
                  <td className={cn(td, 'text-right whitespace-nowrap')} onClick={(e) => e.stopPropagation()}>
                    {live(job) ? (
                      <span className="sign text-[11px] text-muted-foreground">{a?.name ?? 'Agent'} is on it</span>
                    ) : (
                      <button type="button" className="act" disabled={!!sending} onClick={() => rerun(job, pr)}>
                        {sending === job.id ? <span className="working-dots">Fetching the review</span> : 'Address review comments'}
                      </button>
                    )}
                    {result && <p className={cn('mt-1 text-xs', result.failed ? 'text-destructive' : 'text-muted-foreground')}>{result.text}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
