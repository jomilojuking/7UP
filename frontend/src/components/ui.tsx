import type { ReactNode } from "react";

/* Shared building blocks so every page speaks the same visual language. */

export const inputCls =
  "w-full rounded-lg border border-rule bg-surface px-3 py-2 text-[15px] text-ink " +
  "placeholder:text-mist outline-none transition-colors " +
  "hover:border-mist focus:border-spruce focus:ring-3 focus:ring-spruce-soft";

export function PageHeader({ title, children, actions }: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-7">
      <div className="max-w-2xl">
        <h1 className="display text-[44px] text-ink sm:text-[56px]">{title}</h1>
        {children && <p className="mt-3 text-[17px] leading-relaxed text-graphite">{children}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  );
}

export function Panel({ title, description, actions, children, flush, className = "" }: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={"rounded-2xl border border-rule bg-surface shadow-panel " + className}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div>
            {title && <h2 className="text-[17px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-1 max-w-2xl text-sm text-graphite">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={flush ? "" : "px-6 pb-6"}>{children}</div>
    </section>
  );
}

/** A subdivided row inside a panel, separated by a hairline. */
export function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={"border-t border-hairline px-6 py-5 " + className}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-graphite">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-mist">{hint}</span>}
    </label>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "quiet";
  size?: "md" | "sm";
  type?: "button" | "submit";
  title?: string;
};

export function Button({ children, onClick, disabled, variant = "primary", size = "md",
                         type = "button", title }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition " +
    "disabled:cursor-not-allowed disabled:opacity-45 active:translate-y-px ";
  const sizes = { md: "px-4 py-2 text-[15px]", sm: "px-3 py-1.5 text-[13px]" };
  const variants = {
    primary: "bg-spruce text-white hover:bg-spruce-deep shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]",
    secondary: "border border-rule bg-surface text-ink hover:border-mist hover:bg-raised",
    quiet: "text-spruce hover:bg-spruce-soft",
  };
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled}
      className={base + sizes[size] + " " + variants[variant]}>
      {children}
    </button>
  );
}

/** Strip of key numbers separated by hairlines (not a row of separate cards). */
export function Readout({ items }: { items: { label: string; value: ReactNode; note?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-rule bg-hairline shadow-panel sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none">
      {items.map((it) => (
        <div key={it.label} className="bg-surface px-6 py-5">
          <p className="text-[13px] text-graphite">{it.label}</p>
          <p className="num mt-1.5 text-[30px] font-semibold leading-none tracking-tight text-ink">{it.value}</p>
          {it.note && <p className="mt-1.5 text-xs text-mist">{it.note}</p>}
        </div>
      ))}
    </div>
  );
}

const STATUS: Record<string, { cls: string; text?: string }> = {
  done: { cls: "bg-spruce-soft text-spruce-deep" },
  COMPLETE: { cls: "bg-spruce-soft text-spruce-deep", text: "Complete" },
  running: { cls: "bg-brass-soft text-[#7a5a1c]", text: "Running" },
  RUNNING: { cls: "bg-brass-soft text-[#7a5a1c]", text: "Running" },
  queued: { cls: "bg-raised text-graphite", text: "Queued" },
  PRUNED: { cls: "bg-raised text-graphite", text: "Pruned" },
  failed: { cls: "bg-brick-soft text-brick", text: "Failed" },
  FAIL: { cls: "bg-brick-soft text-brick", text: "Failed" },
  gone: { cls: "bg-raised text-mist", text: "Server restarted" },
  imported: { cls: "bg-spruce-soft text-spruce-deep", text: "Ready" },
};

export function Status({ value }: { value: string }) {
  const s = STATUS[value] ?? { cls: "bg-raised text-graphite" };
  const live = value === "running" || value === "RUNNING";
  return (
    <span className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium " + s.cls}>
      <span className={"h-1.5 w-1.5 rounded-full bg-current " + (live ? "animate-pulse" : "")} />
      {s.text ?? value.charAt(0).toUpperCase() + value.slice(1)}
    </span>
  );
}

export function Notice({ tone = "error", children, onClose }: {
  tone?: "error" | "info";
  children: ReactNode;
  onClose?: () => void;
}) {
  const cls = tone === "error"
    ? "border-brick/25 bg-brick-soft text-brick"
    : "border-spruce/20 bg-spruce-soft text-spruce-deep";
  return (
    <div role={tone === "error" ? "alert" : "status"}
      className={"flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm " + cls}>
      <span>{children}</span>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss" className="opacity-60 hover:opacity-100">✕</button>
      )}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-rule px-6 py-14 text-center">
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-md text-sm text-graphite">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export const Mono = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-[13px] text-ink">{children}</span>
);
