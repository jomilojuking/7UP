import { useEffect, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import { useNavigate } from "react-router-dom";
import { request } from "../api";
import { baseLayout, C, plotConfig } from "../chart";
import DatasetPicker from "../components/DatasetPicker";
import InsightsPanel from "../components/InsightsPanel";
import { Button, Empty, Field, inputCls, Notice, PageHeader, Panel, Section, Status } from "../components/ui";
import { loadDataset, SPACE_KEY, type DatasetSpec, type Insights, type SearchSpace } from "../types";

const Plot = createPlotlyComponent(Plotly);

type Saved = { id: number; lr: number; batch: number; epochs: number; wd?: number; dataset?: string };
type Job = {
  id: number;
  status: string;
  accuracy: number | null;
  metrics?: Record<string, number> | null;
  dataset?: string | null;
  hub_url?: string | null;
  hub_error?: string | null;
  error?: string | null;
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

const f3 = (v: number | undefined | null) => (v == null ? "–" : v.toFixed(3));

export default function Experiments() {
  const [modelId, setModelId] = useState(1);
  const [lr, setLr] = useState(0.00002);
  const [batch, setBatch] = useState(16);
  const [epochs, setEpochs] = useState(3);
  const [wd, setWd] = useState(0.01);
  const [warmup, setWarmup] = useState(0.1);
  const [push, setPush] = useState(true);
  const [dataset, setDataset] = useState<DatasetSpec>(loadDataset);
  const [saved, setSaved] = useState<Saved[]>(loadSaved);
  const [jobs, setJobs] = useState<Record<number, Job | null>>({});
  const [picked, setPicked] = useState<number[]>([]);
  const [ab, setAb] = useState<AB | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [insights, setInsights] = useState<{ id: number; data: Insights } | null>(null);
  const [thinking, setThinking] = useState<number | null>(null);
  const navigate = useNavigate();
  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const start = async () => {
    setError("");
    setStarting(true);
    try {
      const job: Job = await request("/finetune/jobs", {
        method: "POST",
        body: JSON.stringify({
          model_id: modelId, learning_rate: lr, batch_size: batch, epochs,
          weight_decay: wd, warmup_ratio: warmup, dataset, push_to_hub: push,
        }),
      });
      const next = [...saved, { id: job.id, lr, batch, epochs, wd, dataset: job.dataset ?? "" }];
      setSaved(next);
      storeSaved(next);
      setJobs((all) => ({ ...all, [job.id]: job }));
    } catch (e: any) {
      setError(e.message);
    }
    setStarting(false);
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
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 2 ? [...p, id] : p));
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

  const explain = async (id: number) => {
    setError("");
    setThinking(id);
    try {
      const data: Insights = await request(`/insights/jobs/${id}`, { method: "POST" });
      setInsights({ id, data });
    } catch (e: any) {
      setError(e.message);
    }
    setThinking(null);
  };

  const tuneWith = (space: SearchSpace) => {
    try {
      localStorage.setItem(SPACE_KEY, JSON.stringify(space));
    } catch {
      // storage unavailable; Tuning Studio just opens with its defaults
    }
    navigate("/tuning");
  };

  const clearHistory = () => {
    setSaved([]);
    storeSaved([]);
    setPicked([]);
  };

  const m = (j: Job | null | undefined, key: string) => {
    let v = j?.metrics?.[key];
    if (v == null && key === "test_accuracy" && j?.accuracy != null) v = j.accuracy;
    return v;
  };

  const finished = saved.filter((s) => jobs[s.id]?.status === "done");

  return (
    <div className="space-y-8">
      <PageHeader title="Experiments">
        Fine-tune an imported model with your own settings, compare runs side by side, and
        ask for a diagnosis when a run under- or overfits.
      </PageHeader>

      <Panel title="New run" flush>
        <Section className="border-t-0 pt-0">
          <DatasetPicker value={dataset} onChange={setDataset} />
        </Section>
        <Section>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Model ID">
              <input type="number" className={inputCls + " num"} value={modelId} onChange={(e) => setModelId(+e.target.value)} />
            </Field>
            <Field label="Learning rate">
              <input type="number" step="any" className={inputCls + " num"} value={lr} onChange={(e) => setLr(+e.target.value)} />
            </Field>
            <Field label="Batch size">
              <input type="number" className={inputCls + " num"} value={batch} onChange={(e) => setBatch(+e.target.value)} />
            </Field>
            <Field label="Epochs (max)">
              <input type="number" className={inputCls + " num"} value={epochs} onChange={(e) => setEpochs(+e.target.value)} />
            </Field>
            <Field label="Weight decay">
              <input type="number" step="any" className={inputCls + " num"} value={wd} onChange={(e) => setWd(+e.target.value)} />
            </Field>
            <Field label="Warmup share">
              <input type="number" step="any" className={inputCls + " num"} value={warmup} onChange={(e) => setWarmup(+e.target.value)} />
            </Field>
          </div>
          <p className="mt-3 text-sm text-graphite">
            The learning rate warms up, then decays to zero. The best epoch is kept, and training
            stops early once test accuracy stops improving.
          </p>
        </Section>
        <Section className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex items-center gap-2.5 text-[15px] text-ink">
            <input type="checkbox" className="h-4 w-4 accent-[#1e5b4b]" checked={push}
              onChange={(e) => setPush(e.target.checked)} />
            Save the trained model to the Hugging Face Hub
          </label>
          <Button onClick={start} disabled={starting}>{starting ? "Starting…" : "Start run"}</Button>
        </Section>
      </Panel>

      {error && <Notice onClose={() => setError("")}>{error}</Notice>}

      <Panel title="Runs" flush
        description={saved.length ? "Tick two finished runs to A/B test them on the same evaluation set." : undefined}
        actions={saved.length > 0 && (
          <div className="flex items-center gap-2">
            {picked.length === 2 && (
              <Button size="sm" onClick={compare}>Compare runs {picked[0]} and {picked[1]}</Button>
            )}
            <Button size="sm" variant="quiet" onClick={clearHistory}>Clear list</Button>
          </div>
        )}>
        {saved.length === 0 ? (
          <div className="px-6 pb-6"><Empty title="No runs yet">Start a run above. It appears here and updates on its own.</Empty></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[14px]">
              <thead>
                <tr className="border-y border-hairline bg-raised text-[13px] text-graphite">
                  <th className="w-12 px-6 py-2.5 font-medium"><span className="sr-only">Pick</span></th>
                  <th className="px-2 py-2.5 font-medium">Run</th>
                  <th className="px-3 py-2.5 font-medium">Settings</th>
                  <th className="px-3 py-2.5 font-medium">Dataset</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Test acc.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Test F1</th>
                  <th className="px-3 py-2.5 text-right font-medium">Train acc.</th>
                  <th className="px-3 py-2.5 text-right font-medium" title="Train accuracy minus test accuracy">Gap</th>
                  <th className="px-3 py-2.5 font-medium">Hub</th>
                  <th className="px-6 py-2.5"><span className="sr-only">Explain</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {saved.slice().reverse().map((s) => {
                  const j = jobs[s.id];
                  const gone = j === null;
                  const done = !!j && j.status === "done";
                  const status = gone ? "gone" : j ? j.status : "queued";
                  const gap = m(j, "generalization_gap");
                  return (
                    <tr key={s.id} className={picked.includes(s.id) ? "bg-spruce-soft/40" : ""}>
                      <td className="px-6 py-3">
                        <input type="checkbox" aria-label={`Pick run ${s.id}`}
                          className="h-4 w-4 accent-[#1e5b4b]" disabled={!done}
                          checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
                      </td>
                      <td className="num px-2 font-semibold text-ink">{s.id}</td>
                      <td className="num px-3 text-graphite">
                        lr {s.lr.toExponential(0)}, batch {s.batch}, {s.epochs} ep
                      </td>
                      <td className="max-w-[160px] truncate px-3 font-mono text-[12px] text-graphite">
                        {j?.dataset ?? s.dataset ?? "–"}
                      </td>
                      <td className="px-3" title={j?.error ?? undefined}><Status value={status} /></td>
                      <td className="num px-3 text-right font-semibold text-ink">{f3(m(j, "test_accuracy"))}</td>
                      <td className="num px-3 text-right text-ink">{f3(m(j, "test_f1"))}</td>
                      <td className="num px-3 text-right text-graphite">{f3(m(j, "train_accuracy"))}</td>
                      <td className={"num px-3 text-right " + (gap != null && gap > 0.05 ? "font-medium text-[#7a5a1c]" : "text-graphite")}>
                        {gap == null ? "–" : (gap > 0 ? "+" : "") + gap.toFixed(3)}
                      </td>
                      <td className="px-3 text-[13px]">
                        {j?.hub_url ? (
                          <a href={j.hub_url} target="_blank" rel="noreferrer" className="font-medium text-spruce hover:underline">View</a>
                        ) : j?.hub_error ? (
                          <span className="text-brick" title={j.hub_error}>Not saved</span>
                        ) : <span className="text-mist">–</span>}
                      </td>
                      <td className="px-6 text-right">
                        <Button size="sm" variant="secondary" disabled={!done || thinking !== null} onClick={() => explain(s.id)}>
                          {thinking === s.id ? "Asking…" : "Explain"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {finished.length > 0 && (
        <Panel title="Train versus test accuracy"
          description="Bars far apart mean the model memorised training data. Close bars mean it generalises.">
          <Plot
            data={[
              { type: "bar", name: "Training", x: finished.map((s) => `Run ${s.id}`),
                y: finished.map((s) => m(jobs[s.id], "train_accuracy") ?? null),
                marker: { color: C.rule }, hovertemplate: "%{y:.3f}<extra>Training</extra>" },
              { type: "bar", name: "Test", x: finished.map((s) => `Run ${s.id}`),
                y: finished.map((s) => m(jobs[s.id], "test_accuracy") ?? null),
                marker: { color: C.spruce }, hovertemplate: "%{y:.3f}<extra>Test</extra>" },
            ] as any}
            layout={baseLayout({
              height: 300, barmode: "group", bargap: finished.length < 3 ? 0.6 : 0.35, bargroupgap: 0.08,
              xaxis: { gridcolor: "rgba(0,0,0,0)", linecolor: C.rule, tickfont: { color: C.graphite } },
              yaxis: { range: [0.4, 1], gridcolor: C.hairline, zeroline: false, tickformat: ".0%", tickfont: { color: C.mist } },
            }) as any}
            config={plotConfig} useResizeHandler style={{ width: "100%" }}
          />
        </Panel>
      )}

      {ab && (
        <Panel title={`A/B test: run ${picked[0] ?? "A"} against run ${picked[1] ?? "B"}`}>
          <div className="grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-3">
            {[
              { label: "Run A accuracy", value: f3(ab.accuracy_a) },
              { label: "Run B accuracy", value: f3(ab.accuracy_b) },
              { label: "p-value", value: ab.p_value == null ? "–" : ab.p_value.toFixed(3) },
            ].map((x) => (
              <div key={x.label} className="bg-surface px-5 py-4">
                <p className="text-[13px] text-graphite">{x.label}</p>
                <p className="num mt-1 text-[26px] font-semibold text-ink">{x.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[15px] text-ink">{ab.verdict ?? "Evaluating both models…"}</p>
        </Panel>
      )}

      {insights && (
        <InsightsPanel title={`Diagnosis for run ${insights.id}`} data={insights.data}
          onUseSpace={tuneWith} useLabel="Tune with these ranges" onClose={() => setInsights(null)} />
      )}
    </div>
  );
}
