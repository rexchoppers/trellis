import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { setup } from '../../wailsjs/go/models';
import { cn } from '@/lib/utils';
import { WindowToggleMaximise } from '../../wailsjs/runtime/runtime';
import { shortPath } from './shared';

// Wails reads this CSS property to let the element move the window.
const dragRegion = { '--wails-draggable': 'drag' } as CSSProperties;

export const noDrag = { '--wails-draggable': 'no-drag' } as CSSProperties;

// pl-[84px] leaves room for the macOS window buttons.
export function TitleBar({ children }: { children: ReactNode }) {
  return (
    <header
      className="flex h-11 shrink-0 items-center gap-7 border-b bg-background pr-5 pl-[84px]"
      style={dragRegion}
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, a, input, select, textarea, label')) WindowToggleMaximise();
      }}
    >
      {children}
    </header>
  );
}

export type Place = { kind: 'project'; path: string } | { kind: 'add' };

export function ProjectSwitcher({ projects, place, onSelect }: { projects: setup.ProjectStatus[]; place?: Place; onSelect: (place: Place) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  const current = place?.kind === 'project' ? projects.find((p) => p.path === place.path) : undefined;
  const pick = (next: Place) => {
    setOpen(false);
    onSelect(next);
  };
  return (
    <div ref={box} className="relative min-w-0 shrink" style={noDrag}>
      <button type="button" className="sign flex max-w-56 min-w-0 items-center gap-1.5 text-[15px] font-bold hover:text-foreground/80" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="truncate">{current?.name ?? (place?.kind === 'add' ? 'Add project' : 'Projects')}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">▼</span>
      </button>
      {open && (
        <div className="absolute top-9 left-0 z-50 grid w-80 border bg-background shadow-[0_18px_40px_-12px_rgb(0_0_0/0.6)]">
          {projects.map((project) => (
            <button
              key={project.path}
              type="button"
              className={cn('grid border-b px-4 py-2.5 text-left hover:bg-muted', current?.path === project.path && 'bg-muted')}
              onClick={() => pick({ kind: 'project', path: project.path })}
            >
              <span className={cn('sign truncate text-sm font-bold', project.missing && 'text-destructive')}>{project.name}</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">{project.missing ? 'Folder missing' : shortPath(project.path)}</span>
            </button>
          ))}
          <button type="button" className="act m-4 justify-self-start" onClick={() => pick({ kind: 'add' })}>
            Add a project →
          </button>
        </div>
      )}
    </div>
  );
}
