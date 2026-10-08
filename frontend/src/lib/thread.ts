import type { config, jobs } from '../../wailsjs/go/models';
import { matches } from './flow';

export const DECIDED: Record<string, string> = {
  allow: 'allowed',
  always: 'always allowed',
  deny: 'denied',
  once: 'allowed once',
  expired: 'expired',
};

export const time = (at: string) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function action(tool: string) {
  const parts = tool.split('__');
  if (parts.length === 3 && parts[0] === 'mcp') {
    const [, server, name] = parts;
    const where = server.toLowerCase().includes('linear') ? 'Linear' : server;
    const words: Record<string, string> = { save_issue: 'Create or change an issue', create_issue: 'Create an issue', save_comment: 'Comment on an issue', save_project: 'Create or change a project' };
    return `${words[name] ?? name.replace(/_/g, ' ')} in ${where}`;
  }
  const builtIn: Record<string, string> = {
    Bash: 'Run a command',
    Edit: 'Edit a file',
    Write: 'Write a file',
    MultiEdit: 'Edit a file',
    NotebookEdit: 'Edit a notebook',
    WebFetch: 'Open a web page',
    WebSearch: 'Search the web',
  };
  return builtIn[tool] ?? `Use ${tool}`;
}

// Only 'yes' counts: the data is all there is, so a field it lacks does not match.
export function listenersFor(departments: config.Department[], event: string, data: Record<string, string>) {
  return departments.flatMap((d) =>
    (d.agents ?? []).filter((a) => (a.listens ?? []).some((l) => l.event === event && matches(l.when, data) === 'yes')).map((a) => a.name),
  );
}

export type Group = { kind: 'steps'; steps: jobs.Entry[] } | { kind: 'entry'; entry: jobs.Entry };

// Steps fold into one line, as do the agent's messages in a turn with a check-in, which repeats them.
export function group(thread: jobs.Entry[]): Group[] {
  const folded = new Set<number>();
  let turn: number[] = [];
  let checkedIn = false;
  for (const entry of thread) {
    if (entry.from === 'you' || entry.from === 'parent' || entry.from === 'child' || entry.kind === 'session') {
      turn = [];
      checkedIn = false;
    } else if (entry.kind === 'text' || entry.kind === 'thinking') {
      // Said after a check-in in the same turn, it repeats the check-in.
      if (checkedIn) folded.add(entry.id);
      else turn.push(entry.id);
    } else if (entry.kind === 'check_in') {
      turn.forEach((id) => folded.add(id));
      turn = [];
      checkedIn = true;
    } else if (entry.kind === 'permission' || entry.kind === 'refused') {
      // The agent's words just before a request explain it, so they stay in view.
      turn = [];
    }
  }
  const out: Group[] = [];
  for (const entry of thread) {
    const last = out[out.length - 1];
    if (entry.kind === 'step' || folded.has(entry.id)) {
      if (last?.kind === 'steps') last.steps.push(entry);
      else out.push({ kind: 'steps', steps: [entry] });
    } else out.push({ kind: 'entry', entry });
  }
  return out;
}
