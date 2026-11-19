import { useEffect, useState } from "react";
import { API, request } from "../api";
import { Mono, PageHeader, Panel, Readout } from "../components/ui";

type Check = { ok: boolean; ms: number; at: string };
type Health = { state_backend: string; runner: string; hub_push: boolean; auth: boolean };

const MAX = 48;

export default function Monitoring() {
  const [up, setUp] = useState<boolean | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [history, setHistory] = useState<Check[]>([]);
  const [total, setTotal] = useState(0);
  const [upCount, setUpCount] = useState(0);

  useEffect(() => {
    const check = async () => {
      const started = performance.now();
      let ok = false;
      try {
        setHealth(await request("/health"));
        ok = true;
      } catch {
        ok = false;
      }
      const ms = Math.round(performance.now() - started);
      setUp(ok);
      setTotal((n) => n + 1);
      if (ok) setUpCount((n) => n + 1);
      setHistory((h) => [...h, { ok, ms, at: new Date().toLocaleTimeString() }].slice(-MAX));
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

  const okChecks = history.filter((c) => c.ok);
  const avg = okChecks.length ? Math.round(okChecks.reduce((a, c) => a + c.ms, 0) / okChecks.length) : null;
  const uptime = total ? Math.round((upCount / total) * 100) : null;
  const maxMs = Math.max(...okChecks.map((c) => c.ms), 1);
  const last = history[history.length - 1];

  const state = up === null
    ? { dot: "bg-mist", title: "Checking the API", sub: "Waiting for the first response." }
    : up
      ? { dot: "bg-spruce", title: "The API is healthy", sub: "Health checks are answering normally." }
      : { dot: "bg-brick", title: "The API is not responding", sub: "The Space may be asleep or restarting. It usually wakes within a minute." };

  const flags = health ? [
    { label: "Job state", value: health.state_backend === "redis" ? "Redis (shared)" : "In memory" },
    { label: "Jobs run on", value: health.runner === "worker" ? "Background worker" : "API process" },
    { label: "Hub storage", value: health.hub_push ? "On" : "Off" },
    { label: "API key", value: health.auth ? "Required" : "Not required" },
  ] : [];

  return (
    <div className="space-y-8">
      <PageHeader title="Monitoring">
        Live health of the backend, checked every 5 seconds from your browser. Server-side
        metrics and alerts live in Grafana and Slack.
      </PageHeader>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rule bg-surface px-6 py-6 shadow-panel" role="status">
        <div className="flex items-center gap-4">
          <span className="relative flex h-3.5 w-3.5">
            {up && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-spruce opacity-30" />}
            <span className={"relative inline-flex h-3.5 w-3.5 rounded-full " + state.dot} />
          </span>
          <div>
            <p className="display text-[28px] text-ink">{state.title}</p>
            <p className="text-sm text-graphite">{state.sub}</p>
          </div>
        </div>
        <p className="num text-sm text-graphite">Last check {last?.at ?? "–"}</p>
      </section>

      <Readout items={[
        { label: "Uptime this session", value: uptime === null ? "–" : uptime + "%" },
        { label: "Average response", value: avg === null ? "–" : <>{avg}<span className="ml-1 text-base font-normal text-graphite">ms</span></> },
        { label: "Checks run", value: total },
      ]} />

      <Panel title="Response time" description={`The last ${MAX} checks, oldest on the left. Taller bars took longer; red marks a failed check.`}>
        <div className="flex h-28 items-end gap-[3px]" role="img" aria-label="Response time of recent health checks">
          {Array.from({ length: Math.max(0, MAX - history.length) }).map((_, i) => (
            <span key={"p" + i} className="h-1.5 flex-1 rounded-sm bg-raised" />
          ))}
          {history.map((c, i) => (
            <span key={i} title={c.ok ? `${c.at}: ${c.ms} ms` : `${c.at}: failed`}
              className={"flex-1 rounded-sm " + (c.ok ? "bg-spruce/80" : "bg-brick")}
              style={{ height: c.ok ? `${Math.max(8, (100 * c.ms) / maxMs)}%` : "100%" }} />
          ))}
        </div>
        <p className="mt-4 text-sm text-graphite">Endpoint <Mono>{API}/health</Mono></p>
      </Panel>

      {flags.length > 0 && (
        <Panel title="Backend configuration">
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {flags.map((f) => (
              <div key={f.label} className="flex items-baseline justify-between border-b border-hairline pb-2">
                <dt className="text-sm text-graphite">{f.label}</dt>
                <dd className="text-[15px] font-medium text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      )}
    </div>
  );
}
