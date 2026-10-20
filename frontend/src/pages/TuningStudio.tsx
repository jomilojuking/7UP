import { useEffect, useState } from "react";
import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import { request } from "../api";


const Plot = createPlotlyComponent(Plotly);


type Trial = {
  number: number;
  state: string;
  learning_rate: number;
  batch_size: number;
  weight_decay: number;
  accuracy: number | null;
};


const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm " +
  "text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white " +
  "focus:ring-4 focus:ring-indigo-100";


const chartFont = { family: "Inter, system-ui, sans-serif", color: "#475569" };


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


function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}


function StateBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    COMPLETE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    PRUNED: "bg-slate-100 text-slate-600 ring-slate-200",
    RUNNING: "bg-amber-50 text-amber-700 ring-amber-200",
    FAIL: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  const cls = styles[state] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset " +
        cls
      }>
      <span
        className={
          "h-1.5 w-1.5 rounded-full bg-current " +
          (state === "RUNNING" ? "animate-pulse" : "")
        }
      />
      {state}
    </span>
  );
}


export default function TuningStudio() {
  const [modelId, setModelId] = useState(1);
  const [nTrials, setNTrials] = useState(3);
  const [studyId, setStudyId] = useState<number | null>(null);
  const [expected, setExpected] = useState(0);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState("");


  const start = async () => {
    setError("");
    setTrials([]);
    setSuggestion("");
    try {
      const r = await request("/tuning/studies", {
        method: "POST",
        body: JSON.stringify({ model_id: modelId, n_trials: nTrials }),
      });
      setExpected(nTrials);
      setStudyId(r.id);
    } catch (e: any) {
      setError(e.message);
    }
  };


  useEffect(() => {
    if (!studyId) return;
    let stopped = false;
    const tick = async () => {
      try {
        const t: Trial[] = await request(`/tuning/studies/${studyId}/trials`);
        setTrials(t);
        if (t.length >= expected && t.every((x) => x.state !== "RUNNING")) {
          stopped = true;
        }
      } catch (e: any) {
        setError(e.message);
        stopped = true;
      }
    };
    tick();
    const id = setInterval(() => {
      if (stopped) clearInterval(id);
      else tick();
    }, 4000);
    return () => clearInterval(id);
  }, [studyId, expected]);


  const getSuggestion = async () => {
    try {
      const r = await request("/suggestions", {
        method: "POST",
        body: JSON.stringify({ study_id: studyId }),
      });
      setSuggestion(r.suggestion);
    } catch (e: any) {
      setError(e.message);
    }
  };


  const done = trials.filter((t) => t.state === "COMPLETE" && t.accuracy !== null);
  const pruned = trials.filter((t) => t.state === "PRUNED").length;
  let best = 0;
  const bestSoFar = trials.map((t) => {
    if (t.state === "COMPLETE" && t.accuracy !== null) {
      best = Math.max(best, t.accuracy);
    }
    return best || null;
  });
  const progress = expected > 0 ? Math.min(100, (trials.length / expected) * 100) : 0;


  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Tuning Studio
        </h2>
        <p className="mt-2 max-w-2xl text-slate-500">
          Search for the best learning rate, batch size and weight decay
          automatically, then ask for a recommendation.
        </p>
      </header>


      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h3 className="font-semibold text-slate-900">New study</h3>
          <p className="mt-1 text-sm text-slate-500">
            Each trial fine-tunes the model with a different set of
            hyperparameters. More trials take longer.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4 px-6 py-5">
          <div className="w-32">
            <Field label="Model id">
              <input
                type="number"
                className={inputCls}
                value={modelId}
                onChange={(e) => setModelId(+e.target.value)}
              />
            </Field>
          </div>
          <div className="w-32">
            <Field label="Trials">
              <input
                type="number"
                className={inputCls}
                value={nTrials}
                onChange={(e) => setNTrials(+e.target.value)}
              />
            </Field>
          </div>
          <button
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
            onClick={start}>
            Start study
          </button>
          {studyId && (
            <button
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={getSuggestion}>
              Get suggestion
            </button>
          )}
        </div>
        {studyId && expected > 0 && (
          <div className="px-6 pb-5">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{ width: progress + "%" }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {trials.length} of {expected} trials started
            </p>
          </div>
        )}
      </section>


      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}


      {suggestion && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6">
          <h3 className="font-semibold text-slate-900">Suggestion</h3>
          <p className="mt-2 text-slate-700">{suggestion}</p>
        </section>
      )}


      {!studyId && (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
          <p className="font-semibold text-slate-900">No study running</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Pick a model and the number of trials, then start a study to see
            results here.
          </p>
        </section>
      )}


      {studyId && trials.length === 0 && (
        <section className="rounded-2xl border border-slate-200/70 bg-white px-6 py-14 text-center shadow-sm">
          <p className="font-semibold text-slate-900">
            Waiting for the first trial...
          </p>
          <p className="mt-1 text-sm text-slate-500">
            This page refreshes on its own every few seconds.
          </p>
        </section>
      )}


      {trials.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Trials finished" value={String(done.length)} />
            <Stat
              label="Best accuracy"
              value={done.length ? best.toFixed(3) : "-"}
            />
            <Stat label="Pruned trials" value={String(pruned)} />
          </div>


          <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <Plot
              data={
                [
                  {
                    x: trials.map((t) => t.number),
                    y: trials.map((t) => t.accuracy),
                    type: "scatter",
                    mode: "markers",
                    name: "Trial accuracy",
                    marker: {
                      size: 11,
                      color: trials.map((t) =>
                        t.state === "PRUNED" ? "#cbd5e1" : "#4f46e5"
                      ),
                    },
                  },
                  {
                    x: trials.map((t) => t.number),
                    y: bestSoFar,
                    type: "scatter",
                    mode: "lines",
                    name: "Best so far",
                    line: { color: "#10b981", width: 3 },
                  },
                ] as any
              }
              layout={
                {
                  title: { text: "Optimization history" },
                  xaxis: { title: { text: "Trial" }, dtick: 1 },
                  yaxis: { title: { text: "Accuracy" } },
                  height: 400,
                  autosize: true,
                  font: chartFont,
                  paper_bgcolor: "rgba(0,0,0,0)",
                  plot_bgcolor: "rgba(0,0,0,0)",
                  margin: { t: 50, r: 20, b: 50, l: 60 },
                  legend: { orientation: "h", y: -0.2 },
                } as any
              }
              useResizeHandler
              style={{ width: "100%" }}
            />
          </section>


          {done.length > 1 && (
            <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <Plot
                data={
                  [
                    {
                      type: "parcoords",
                      line: {
                        color: done.map((t) => t.accuracy as number),
                        colorscale: "Viridis",
                        showscale: true,
                      },
                      dimensions: [
                        {
                          label: "Learning rate",
                          values: done.map((t) => t.learning_rate),
                        },
                        {
                          label: "Batch size",
                          values: done.map((t) => t.batch_size),
                        },
                        {
                          label: "Weight decay",
                          values: done.map((t) => t.weight_decay),
                        },
                        {
                          label: "Accuracy",
                          values: done.map((t) => t.accuracy as number),
                        },
                      ],
                    },
                  ] as any
                }
                layout={
                  {
                    title: { text: "Parallel coordinates" },
                    height: 420,
                    autosize: true,
                    font: chartFont,
                    paper_bgcolor: "rgba(0,0,0,0)",
                    margin: { t: 60, r: 40, b: 30, l: 60 },
                  } as any
                }
                useResizeHandler
                style={{ width: "100%" }}
              />
            </section>
          )}


          <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h3 className="font-semibold text-slate-900">Trials</h3>
              <p className="mt-1 text-sm text-slate-500">
                PRUNED means the tuning tool stopped a weak trial early to save
                time. This is normal.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Trial</th>
                    <th className="px-3 font-semibold">State</th>
                    <th className="px-3 font-semibold">Learning rate</th>
                    <th className="px-3 font-semibold">Batch</th>
                    <th className="px-3 font-semibold">Weight decay</th>
                    <th className="px-3 font-semibold">Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trials.map((t) => (
                    <tr key={t.number} className="transition hover:bg-slate-50/70">
                      <td className="px-6 py-3 font-medium text-slate-900">
                        {t.number}
                      </td>
                      <td className="px-3">
                        <StateBadge state={t.state} />
                      </td>
                      <td className="px-3 tabular-nums text-slate-700">
                        {t.learning_rate.toExponential(2)}
                      </td>
                      <td className="px-3 tabular-nums text-slate-700">
                        {t.batch_size}
                      </td>
                      <td className="px-3 tabular-nums text-slate-700">
                        {t.weight_decay.toFixed(3)}
                      </td>
                      <td className="px-3 tabular-nums text-slate-700">
                        {t.accuracy?.toFixed(3) ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}