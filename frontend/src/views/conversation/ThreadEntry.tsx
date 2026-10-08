import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { config, jobs } from '../../../wailsjs/go/models';
import { action, DECIDED, time, type Group } from '@/lib/thread';
import { cn, plural } from '@/lib/utils';

function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="sign text-[10px] text-muted-foreground">{children}</span>;
}

export function Live({ name, last }: { name: string; last?: jobs.Entry }) {
  const step = last?.kind === 'step' ? `${last.tool} ${last.input ?? ''}`.trim() : '';
  return (
    <p className="flex items-center gap-2 text-[13px] text-[var(--working)]">
      <span className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-[var(--working)]" />
      <span className="sign shrink-0 text-[11px] font-bold">{step ? `${name} is working` : `${name} is thinking…`}</span>
      {step && <span className="truncate font-mono text-xs text-[#c9c9c2]">{step}</span>}
    </p>
  );
}

function Fields({ data }: { data?: Record<string, string> }) {
  const entries = Object.entries(data ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return null;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="sign text-[10px] text-muted-foreground">{key}</dt>
          <dd className="break-words">
            {/^https?:\/\//.test(value) ? (
              <a href={value} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {value}
              </a>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// `now` marks the run in progress, which stays unfolded.
export function ThreadEntry({
  group: g,
  now,
  name,
  outcomes,
  open,
  onAnswer,
}: {
  group: Group;
  now: boolean;
  name: string;
  outcomes: config.Outcome[];
  open: boolean;
  onAnswer: (entry: jobs.Entry, decision: string) => void;
}) {
  if (g.kind === 'steps') {
    const count = g.steps.filter((step) => step.kind === 'step').length;
    return (
      <details className="font-mono text-xs text-muted-foreground" open={now || undefined}>
        <summary className="cursor-pointer list-none select-none">
          <span className="mr-2">▸</span>
          {count ? `${now ? 'Working' : 'Worked'} · ${plural(count, 'step')}` : 'Notes'}
        </summary>
        <ol className="mt-2 grid gap-0.5 pl-4 text-[11px] break-words">
          {g.steps.map((step) =>
            step.kind === 'step' ? (
              <li key={step.id}>
                {step.tool} <span className="text-[#c9c9c2]">{step.input}</span>
              </li>
            ) : (
              <li key={step.id} className="font-sans whitespace-pre-wrap text-[#c9c9c2] italic">
                {step.text}
              </li>
            ),
          )}
        </ol>
      </details>
    );
  }
  const e = g.entry;
  switch (e.kind) {
    case 'session':
      return (
        <div className="grid gap-1.5">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="sign text-[11px] text-muted-foreground">New session · {time(e.at)}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <p className="text-xs whitespace-pre-wrap text-muted-foreground">{e.text}</p>
        </div>
      );
    case 'task':
    case 'message':
      if (e.from === 'parent' || e.from === 'child')
        return (
          <div className="flex flex-col gap-1.5">
            <Label>
              {e.by} · {e.from === 'parent' ? 'started this' : 'your job'} · {time(e.at)}
            </Label>
            <p className="max-w-[85%] border-l-2 border-muted-foreground/50 bg-[#151514] px-3 py-2.5 text-sm whitespace-pre-wrap">{e.text}</p>
          </div>
        );
      return (
        <div className="flex flex-col items-end gap-1.5">
          <Label>You · {time(e.at)}</Label>
          <p className="max-w-[85%] bg-[#1d1d1b] px-3 py-2.5 text-sm whitespace-pre-wrap">{e.text || 'Your choice.'}</p>
        </div>
      );
    case 'text':
      return (
        <div className="flex flex-col gap-1.5">
          <Label>
            {name} · {time(e.at)}
          </Label>
          <Markdown text={e.text ?? ''} />
        </div>
      );
    case 'thinking':
      return (
        <details className="text-[13px] text-muted-foreground">
          <summary className="cursor-pointer list-none truncate italic select-none">
            <span className="sign mr-2 text-[10px] not-italic">Thought</span>
            {e.text}
          </summary>
          <p className="mt-1.5 border-l pl-3 whitespace-pre-wrap italic">{e.text}</p>
        </details>
      );
    case 'check_in':
      return (
        <div className="flex flex-col gap-1.5">
          <Label>
            {name} · checked in · {time(e.at)}
          </Label>
          <div className="border bg-card px-3.5 py-3">
            <Markdown text={e.text ?? ''} />
          </div>
          {e.outcome && <Label>Proposes: {outcomes.find((o) => o.name === e.outcome)?.label ?? e.outcome}</Label>}
        </div>
      );
    case 'event':
      return (
        <div className="flex flex-col gap-1.5 border-2 border-foreground px-3.5 py-3">
          <span className="sign text-[11px] font-bold">
            From {e.text} · {e.outcome}
          </span>
          <Fields data={e.data} />
        </div>
      );
    case 'sent':
      return (
        <div className="flex flex-col gap-1 border px-3.5 py-3">
          <span className="sign text-[11px] font-bold">{e.text}</span>
          <Fields data={e.data} />
        </div>
      );
    case 'permission':
    case 'refused': {
      const asking = e.kind === 'permission';
      const pending = !e.decision && open;
      return (
        <div className={cn('flex flex-col gap-1.5 px-3.5 py-3', pending ? 'border-2 border-[var(--amber)]' : 'border')}>
          <span className={cn('sign text-[11px] font-bold', pending ? 'text-[var(--amber)]' : 'text-muted-foreground')}>
            {name} {pending ? (asking ? 'wants to' : "isn't allowed to") : `wanted to · ${DECIDED[e.decision ?? ''] ?? (asking ? 'not answered' : 'not allowed')}`}
          </span>
          <span className="text-[15px] font-semibold">{action(e.text ?? e.tool ?? '')}</span>
          {e.input && <span className="font-mono text-xs break-all text-[#c9c9c2]">{e.input}</span>}
          {pending && (
            <div className="mt-1.5 flex gap-[18px]">
              {asking ? (
                <>
                  <button type="button" className="act" onClick={() => onAnswer(e, 'allow')}>
                    Allow
                  </button>
                  <button type="button" className="act" onClick={() => onAnswer(e, 'always')}>
                    Always
                  </button>
                  <button type="button" className="act text-muted-foreground" onClick={() => onAnswer(e, 'deny')}>
                    Deny
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="act" onClick={() => onAnswer(e, 'once')}>
                    Allow once
                  </button>
                  <button type="button" className="act" onClick={() => onAnswer(e, 'always')}>
                    Always
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      );
    }
    case 'done':
    case 'signed':
    case 'cancelled':
      return (
        <p className="sign text-right text-[11px] text-muted-foreground">
          {e.from === 'agent' ? name : 'You'} {e.kind === 'cancelled' ? 'cancelled the job' : e.text ? `finished it: ${e.text}` : 'finished it'} · {time(e.at)}
        </p>
      );
    default:
      return <p className="text-center text-xs text-muted-foreground">{e.text}</p>;
  }
}
