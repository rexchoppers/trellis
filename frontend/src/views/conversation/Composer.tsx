import { useEffect, useState } from 'react';
import { CancelJob, Finish, SendMessage } from '../../../wailsjs/go/main/App';
import type { config, jobs } from '../../../wailsjs/go/models';
import { stateLabel } from '@/lib/jobs';
import { listenersFor } from '@/lib/thread';
import { Select } from '../shared';

export function Composer({
  projectPath,
  job,
  name,
  outcomes,
  departments,
  open,
  blocked,
  run,
  onSend,
}: {
  projectPath: string;
  job: jobs.Job;
  name: string;
  outcomes: config.Outcome[];
  departments: config.Department[];
  open: boolean;
  // While a request waits, the agent is blocked on it: a message would only queue behind it.
  blocked: boolean;
  run: (call: Promise<unknown>) => Promise<unknown>;
  onSend: () => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Set while finish/cancel is in flight; nothing else in the panel can be pressed until it lands.
  const [ending, setEnding] = useState<'finish' | 'cancel'>();
  useEffect(() => {
    setEnding(undefined);
    setText('');
  }, [job.id]);
  const end = (how: 'finish' | 'cancel', call: () => Promise<unknown>) => {
    if (ending) return;
    setEnding(how);
    run(call()).finally(() => {
      setEnding(undefined);
      setConfirmCancel(false);
    });
  };
  const [picked, setPicked] = useState('');
  useEffect(() => setPicked(job.outcome ?? ''), [job.id, job.outcome]);
  const chosen = outcomes.find((o) => o.name === picked);
  const sends = (outcome: config.Outcome) => {
    if (outcome.back) return job.from ? `Sends it back to ${job.from.agent}, in their original job` : 'Nothing to send it back to';
    if (!outcome.publish) return 'Nothing is sent';
    const receivers = listenersFor(departments, outcome.publish, { ...(job.data ?? {}), ...(outcome.with ?? {}) });
    return receivers.length ? `Sends ${outcome.publish} → starts ${receivers.join(', ')}` : `Sends ${outcome.publish} · nobody is listening`;
  };

  const send = (e?: React.FormEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    if (!text.trim() || sending || blocked) return;
    setSending(true);
    onSend();
    run(SendMessage(projectPath, job.id, text).then(() => setText(''))).finally(() => setSending(false));
  };

  if (!open) return <p className="sign border-t px-5 py-3.5 text-[11px] text-muted-foreground">{stateLabel(job.state)}</p>;
  return (
    <form onSubmit={send} className="grid gap-3 border-t px-5 py-3.5">
      <label htmlFor="feedback" className="sr-only">
        Feedback for {name}
      </label>
      <textarea
        id="feedback"
        rows={2}
        value={text}
        placeholder={blocked ? 'Allow or deny the request above first' : `Feedback for ${name}`}
        disabled={blocked}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
        }}
        className="max-h-40 min-h-[52px] resize-none border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-muted-foreground disabled:opacity-50"
      />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button type="submit" className="act" disabled={sending || blocked || !!ending || !text.trim()}>
          Send feedback →
        </button>
        {outcomes.length > 0 && (
          <Select
            id="outcome"
            label="Ended"
            value={picked}
            onChange={setPicked}
            options={[['', 'Choose'], ...outcomes.map((o): [string, string] => [o.name, o.label])]}
            className="sign text-[11px] text-muted-foreground"
          />
        )}
        <button type="button" className="act" disabled={sending || !!ending || (outcomes.length > 0 && !chosen)} onClick={() => end('finish', () => Finish(projectPath, job.id, picked))}>
          {ending === 'finish' ? <span className="working-dots">{job.branch ? 'Opening the PR' : 'Finishing'}</span> : job.branch ? 'Finish · open PR' : 'Finish'}
        </button>
        {confirmCancel ? (
          <span className="sign ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
            Cancel this job?
            <button type="button" className="act text-destructive" disabled={!!ending} onClick={() => end('cancel', () => CancelJob(projectPath, job.id))}>
              {ending === 'cancel' ? <span className="working-dots">Cancelling</span> : 'Yes'}
            </button>
            <button type="button" className="act" onClick={() => setConfirmCancel(false)}>
              No
            </button>
          </span>
        ) : (
          <button type="button" className="act ml-auto text-muted-foreground" disabled={!!ending} onClick={() => setConfirmCancel(true)}>
            Cancel
          </button>
        )}
      </div>
      {chosen && <p className="sign text-[11px] text-muted-foreground">{sends(chosen)}</p>}
    </form>
  );
}
