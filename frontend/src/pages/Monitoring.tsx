import { useEffect, useState } from "react";
import { API, request } from "../api";


type Check = { ok: boolean; ms: number };


const MAX = 40;


function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-2xl border p-5 shadow-sm " +
        (accent ? "border-indigo-200 bg-indigo-50" : "border-slate-200/70 bg-white")
      }>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={
          "mt-1 text-2xl font-bold tabular-nums " +
          (accent ? "text-indigo-700" : "text-slate-900")
        }>
        {value}
      </p>
    </div>
  );
}


export default function Monitoring() {
  const [up, setUp] = useState<boolean | null>(null);
  const [checked, setChecked] = useState("");
  const [history, setHistory] = useState<Check[]>([]);
  const [total, setTotal] = useState(0);
  const [upCount, setUpCount] = useState(0);


  useEffect(() => {
    const check = async () => {
      const started = performance.now();
      let ok = false;
      try {
        await request("/health");
        ok = true;
      } catch {
        ok = false;
      }
      const ms = Math.round(performance.now() - started);
      setUp(ok);
      setChecked(new Date().toLocaleTimeString());
      setTotal((n) => n + 1);
      if (ok) setUpCount((n) => n + 1);
      setHistory((h) => [...h, { ok, ms }].slice(-MAX));
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);


  const okChecks = history.filter((c) => c.ok);
  const avg = okChecks.length
    ? Math.round(okChecks.reduce((a, c) => a + c.ms, 0) / okChecks.length)
    : null;
  const uptime = total ? Math.round((upCount / total) * 100) : null;
  const padding = Array.from({ length: Math.max(0, MAX - history.length) });


  const tone =
    up === null
      ? {
          card: "border-slate-200 bg-white",
          dot: "bg-slate-300",
          title: "Checking...",
          sub: "Contacting the API.",
        }
      : up
      ? {
          card: "border-emerald-200 bg-gradient-to-r from-emerald-50 to-white",
          dot: "bg-emerald-500",
          title: "Backend is healthy",
          sub: "The API is responding to health checks.",
        }
      : {
          card: "border-rose-200 bg-gradient-to-r from-rose-50 to-white",
          dot: "bg-rose-500",
          title: "Backend is down",
          sub: "The health check is not responding.",
        };


  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Monitoring
        </h2>
        <p className="mt-2 max-w-2xl text-slate-500">
          Live health of the API, checked every 5 seconds.
        </p>
      </header>


      <section
        className={
          "flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-6 shadow-sm " +
          tone.card
        }>
        <div className="flex items-center gap-4">
          <span className="relative flex h-5 w-5">
            {up && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            )}
            <span className={"relative inline-flex h-5 w-5 rounded-full " + tone.dot} />
          </span>
          <div>
            <p className="text-xl font-semibold text-slate-900">{tone.title}</p>
            <p className="text-sm text-slate-500">{tone.sub}</p>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          Last checked{" "}
          <span className="font-mono font-semibold text-slate-800">
            {checked || "-"}
          </span>
        </p>
      </section>


      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          accent
          label="Uptime (this session)"
          value={uptime === null ? "-" : uptime + "%"}
        />
        <Stat
          label="Avg. response"
          value={avg === null ? "-" : avg + " ms"}
        />
        <Stat label="Checks run" value={String(total)} />
      </div>


      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h3 className="font-semibold text-slate-900">Recent checks</h3>
          <p className="mt-1 text-sm text-slate-500">
            The last {MAX} health checks, oldest on the left.
          </p>
        </div>
        <div className="px-6 py-6">
          <div className="flex h-14 items-stretch gap-1.5">
            {padding.map((_, i) => (
              <span key={"p" + i} className="flex-1 rounded-full bg-slate-100" />
            ))}
            {history.map((c, i) => (
              <span
                key={i}
                title={c.ok ? c.ms + " ms" : "failed"}
                className={
                  "flex-1 rounded-full " + (c.ok ? "bg-emerald-400" : "bg-rose-400")
                }
              />
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Endpoint <span className="font-mono text-slate-700">{API}/health</span>
          </p>
        </div>
      </section>
    </div>
  );
}