import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const folderName = (path: string) => path.split('/').filter(Boolean).pop() ?? path;

export const shortPath = (path: string) => path.split('/').filter(Boolean).slice(-2).join('/');

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-6 pb-6">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t py-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function FormMessage({ error }: { error?: string }) {
  return error ? <p className="text-sm text-destructive">{error}</p> : null;
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Close" className="text-muted-foreground hover:text-foreground" onClick={onClick}>
      ✕
    </button>
  );
}

export function Swatch({ colour }: { colour?: string }) {
  return <span className="mr-1.5 inline-block size-2" style={{ background: colour }} />;
}

export function Stat({ value, label, tone }: { value: number; label: string; tone?: string | false }) {
  return (
    <div className="grid gap-1">
      <span className={cn('sign text-[44px] leading-none font-extrabold tabular-nums', tone)}>{value}</span>
      <span className="sign text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

export function Select({
  id,
  label,
  value,
  onChange,
  options,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  className?: string;
}) {
  return (
    <label htmlFor={id} className={cn('flex items-center gap-1.5', className)}>
      {label}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="sign border-0 border-b border-input bg-transparent py-0.5 text-foreground outline-none">
        {options.map(([v, text]) => (
          <option key={v} value={v} className="bg-background">
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
