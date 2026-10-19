import { useEffect, useRef, useState } from "react";
import { request } from "../api";


type Saved = { id: number; lr: number; batch: number; epochs: number };
type Job = {
  id: number;
  status: string;
  accuracy: number | null;
  metrics?: Record<string, number> | null;
};
type AB = {
  id: number;
  status: string;
  accuracy_a: number | null;
  accuracy_b: number | null;
  p_value: number | null;
  verdict: string | null;
};


const KEY = "jobs";


function loadSaved(): Saved[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}


function storeSaved(list: Saved[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage unavailable, the page still works for this visit
  }
}


const COLS = [
  { key: "accuracy", label: "Accuracy" },
  { key: "precision", label: "Precision" },
  { key: "recall", label: "Recall" },
  { key: "f1", label: "F1" },
  { key: "loss", label: "Loss" },
];
const GROUPS = [
  { title: "Test set", prefix: "test" },
  { title: "Train set", prefix: "train" },
];


const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm " +
  "text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white " +
  "focus:ring-4 focus:ring-indigo-100";


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}


function Badge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    done: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    running: "bg-amber-50 text-amber-700 ring-amber-200",
    queued: "bg-slate-100 text-slate-600 ring-slate-200",
    failed: "bg-rose-50 text-rose-700 ring-rose-200",
    gone: "bg-slate-100 text-slate-500 ring-slate-200",
  };
  const cls = styles[status] ?? styles.queued;
  const text = status === "gone" ? "backend restarted" : status;
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset " +
        cls
      }>
      <span
        className={
          "h-1.5 w-1.5 rounded-full bg-current " +
          (status === "running" ? "animate-pulse" : "")
        }
      />
      {text}
    </span>
  );
}


export default function Experiments() {
  const [modelId, setModelId] = useState(1);
  const [lr, setLr] = useState(0.00002);
  const [batch, setBatch] = useState(16);
  const [epochs, setEpochs] = useState(1);
  const [saved, setSaved] = useState<Saved[]>(loadSaved);
  const [jobs, setJobs] = useState<Record<number, Job | null>>({});
  const [picked, setPicked] = useState<number[]>([]);
  const [ab, setAb] = useState<AB | null>(null);
  const [error, setError] = useState("");
  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);


  const start = async () => {
    setError("");
    try {
      const job: Job = await request("/finetune/jobs", {
        method: "POST",
        body: JSON.stringify({
          model_id: modelId,
          learning_rate: lr,
          batch_size: batch,
          epochs: epochs,
        }),
      });
      const next = [...saved, { id: job.id, lr, batch, epochs }];
      setSaved(next);
      storeSaved(next);
      setJobs((all) => ({ ...all, [job.id]: job }));
    } catch (e: any) {
      setError(e.message);
    }
  };


  useEffect(() => {
    const tick = async () => {
      for (const s of saved) {
        const cur = jobsRef.current[s.id];
        if (cur === null) continue;
        if (cur && (cur.status === "done" || cur.status === "failed")) continue;
        try {
          const j: Job = await request("/finetune/jobs/" + s.id);
          setJobs((all) => ({ ...all, [s.id]: j }));
        } catch (e: any) {
          if (String(e.message).includes("Unknown")) {
            setJobs((all) => ({ ...all, [s.id]: null }));
          }
        }
      }
    };
    tick();
    const timer = setInterval(tick, 4000);
    return () => clearInterval(timer);
  }, [saved]);


  const toggle = (id: number) => {
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length < 2 ? [...p, id] : p
    );
  };


  const compare = async () => {
    setError("");
    setAb(null);
    try {
      const created = await request("/ab-tests", {
        method: "POST",
        body: JSON.stringify({ job_a: picked[0], job_b: picked[1] }),
      });
      for (let i = 0; i < 30; i++) {
        const res: AB = await request("/ab-tests/" + created.id + "/results");
        setAb(res);
        if (res.verdict || res.status === "done" || res.status === "failed") break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (e: any) {
      setError(e.message);
    }
  };


  // one metric value from a job, or a dash when it is not there yet
  const metric = (j: Job | null | undefined, key: string) => {
    let v = j && j.metrics ? j.metrics[key] : undefined;
    if (v == null && key === "test_accuracy" && j && j.accuracy != null) {
      v = j.accuracy;
    }
    return v != null ? v.toFixed(3) : "-";
  };


  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Experiments
        </h2>
        <p className="mt-2 max-w-2xl text-slate-500">
          Launch fine-tuning runs, track their metrics, and A/B test any two
          finished runs against each other.
        </p>
      </header>


      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h3 className="font-semibold text-slate-900">New run</h3>
          <p className="mt-1 text-sm text-slate-500">
            Fine-tune an imported model with your own hyperparameters.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 px-6 py-5 sm:grid-cols-4">
          <Field label="Model id">
            <input
              type="number"
              className={inputCls}
              value={modelId}
              onChange={(e) => setModelId(+e.target.value)}
            />
          </Field>
          <Field label="Learning rate">
            <input
              type="number"
              step="any"
              className={inputCls}
              value={lr}
              onChange={(e) => setLr(+e.target.value)}
            />
          </Field>
          <Field label="Batch size">
            <input
              type="number"
              className={inputCls}
              value={batch}
              onChange={(e) => setBatch(+e.target.value)}
            />
          </Field>
          <Field label="Epochs">
            <input
              type="number"
              className={inputCls}
              value={epochs}
              onChange={(e) => setEpochs(+e.target.value)}
            />
          </Field>
        </div>
        <div className="px-6 pb-6">
          <button
            className="w-full rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] sm:w-auto"
            onClick={start}>
            Start run
          </button>
        </div>
      </section>


      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}


      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h3 className="font-semibold text-slate-900">Runs</h3>
            <p className="mt-1 text-sm text-slate-500">
              Tick two finished runs to compare them.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {saved.length} {saved.length === 1 ? "run" : "runs"}
          </span>
        </div>


        {saved.length === 0 ? (
          <p className="px-6 py-10 text-center text-slate-500">
            No runs yet. Start one above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th rowSpan={2} className="px-6 py-3 font-semibold">Pick</th>
                  <th rowSpan={2} className="px-3 font-semibold">Run</th>
                  <th rowSpan={2} className="px-3 font-semibold">LR</th>
                  <th rowSpan={2} className="px-3 font-semibold">Batch</th>
                  <th rowSpan={2} className="px-3 font-semibold">Epochs</th>
                  <th rowSpan={2} className="px-3 font-semibold">Status</th>
                  {GROUPS.map((g) => (
                    <th
                      key={g.prefix}
                      colSpan={COLS.length}
                      className="border-l border-slate-100 bg-slate-50 px-3 py-2 text-center font-semibold text-slate-700">
                      {g.title}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  {GROUPS.map((g) =>
                    COLS.map((c, i) => (
                      <th
                        key={g.prefix + c.key}
                        className={
                          "bg-slate-50 px-3 py-2 font-medium normal-case " +
                          (i === 0 ? "border-l border-slate-100" : "")
                        }>
                        {c.label}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {saved.map((s) => {
                  const j = jobs[s.id];
                  const gone = j === null;
                  const done = !!j && j.status === "done";
                  const status = gone ? "gone" : j ? j.status : "queued";
                  return (
                    <tr key={s.id} className="transition hover:bg-slate-50/70">
                      <td className="px-6 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
                          disabled={!done}
                          checked={picked.includes(s.id)}
                          onChange={() => toggle(s.id)}
                        />
                      </td>
                      <td className="px-3 font-medium text-slate-900">{s.id}</td>
                      <td className="px-3 text-slate-600">{s.lr}</td>
                      <td className="px-3 text-slate-600">{s.batch}</td>
                      <td className="px-3 text-slate-600">{s.epochs}</td>
                      <td className="px-3">
                        <Badge status={status} />
                      </td>
                      {GROUPS.map((g) =>
                        COLS.map((c, i) => (
                          <td
                            key={g.prefix + c.key}
                            className={
                              "px-3 tabular-nums text-slate-700 " +
                              (i === 0 ? "border-l border-slate-100" : "")
                            }>
                            {metric(j, g.prefix + "_" + c.key)}
                          </td>
                        ))
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}


        {picked.length === 2 && (
          <div className="border-t border-slate-100 px-6 py-4">
            <button
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              onClick={compare}>
              Compare runs {picked[0]} and {picked[1]}
            </button>
          </div>
        )}
      </section>


      {ab && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6">
          <h3 className="font-semibold text-slate-900">A/B test result</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Accuracy A
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {ab.accuracy_a?.toFixed(3) ?? "-"}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Accuracy B
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {ab.accuracy_b?.toFixed(3) ?? "-"}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                p-value
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {ab.p_value?.toFixed(4) ?? "-"}
              </p>
            </div>
          </div>
          <p className="mt-4 font-semibold text-slate-800">
            {ab.verdict ?? "Waiting for the result..."}
          </p>
        </section>
      )}
    </div>
  );
}