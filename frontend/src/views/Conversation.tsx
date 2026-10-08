import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Answer } from '../../wailsjs/go/main/App';
import type { config, jobs } from '../../wailsjs/go/models';
import { live, useThread } from '@/lib/jobs';
import { group } from '@/lib/thread';
import { Composer } from './conversation/Composer';
import { Header, type Who } from './conversation/Header';
import { Live, ThreadEntry } from './conversation/ThreadEntry';
import { message } from './shared';

export function Conversation({
  projectPath,
  job,
  who,
  agent,
  departments,
  back,
  onClose,
  onOpenJob,
}: {
  projectPath: string;
  job: jobs.Job;
  who: Who;
  agent?: config.Agent;
  departments: config.Department[];
  back?: string;
  onClose: () => void;
  onOpenJob?: (id: string) => void;
}) {
  const thread = useThread(projectPath, job.id);
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [error, setError] = useState<string>();
  const open = live(job);
  const outcomes = agent?.outcomes ?? [];

  useEffect(() => {
    setError(undefined);
    stuck.current = true;
  }, [job.id]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  });
  const onScroll = () => {
    const el = scroller.current;
    if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const run = (call: Promise<unknown>) => {
    setError(undefined);
    return call.catch((err) => setError(message(err)));
  };
  const blocked = job.reason === 'permission' && thread.some((e) => (e.kind === 'permission' || e.kind === 'refused') && !e.decision);
  const answer = (entry: jobs.Entry, decision: string) => run(Answer(projectPath, job.id, entry.id, decision));
  const groups = group(thread);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-background" aria-label={`${who.name}: ${job.task || 'conversation'}`}>
      <Header job={job} who={who} back={back} onClose={onClose} onOpenJob={onOpenJob} />

      <div ref={scroller} onScroll={onScroll} className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-5 py-[18px]">
        {groups.map((g, i) => (
          <ThreadEntry
            key={g.kind === 'steps' ? `steps-${g.steps[0].id}` : g.entry.id}
            group={g}
            now={job.state === 'working' && i === groups.length - 1}
            name={who.name}
            outcomes={outcomes}
            open={open}
            onAnswer={answer}
          />
        ))}

        {job.state === 'working' && <Live name={who.name} last={thread[thread.length - 1]} />}
      </div>

      <Composer
        projectPath={projectPath}
        job={job}
        name={who.name}
        outcomes={outcomes}
        departments={departments}
        open={open}
        blocked={blocked}
        run={run}
        onSend={() => (stuck.current = true)}
      />
      {error && <p className="px-5 pb-3 text-xs text-destructive">{error}</p>}
    </section>
  );
}
