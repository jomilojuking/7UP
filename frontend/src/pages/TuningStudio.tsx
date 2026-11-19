import { useEffect, useState } from "react";
import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import { request } from "../api";
import { baseLayout, C, plotConfig } from "../chart";
import DatasetPicker from "../components/DatasetPicker";
import InsightsPanel from "../components/InsightsPanel";
import { Button, Empty, Field, inputCls, Notice, PageHeader, Panel, Readout, Section, Status } from "../components/ui";
import { DEFAULT_SPACE, loadDataset, SPACE_KEY, type DatasetSpec, type Insights, type SearchSpace } from "../types";

const Plot = createPlotlyComponent(Plotly);

type Trial = {
  number: number;
  state: string;
  learning_rate: number;
  batch_size: number;
  weight_decay: number;
  accuracy: number | null;
};

function initialSpace(): SearchSpace {
  // "Tune with these ranges" on the Experiments page lands here.
  try {
    const saved = localStorage.getItem(SPACE_KEY);
    if (saved) {
      localStorage.removeItem(SPACE_KEY);
      return { ...DEFAULT_SPACE, ...JSON.parse(saved) };
    }
  } catch {
    // ignore unreadable storage
  }
  return DEFAULT_SPACE;
}

export default function TuningStudio() {
  const [modelId, setModelId] = useState(1);
  const [nTrials, setNTrials] = useState(5);
  const [studyId, setStudyId] = useState<number | null>(null);
  const [expected, setExpected] = useState(0);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [error, setError] = useState("");
  const [dataset, setDataset] = useState<DatasetSpec>(loadDataset);
  const [space, setSpace] = useState<SearchSpace>(initialSpace);
  const [batchText, setBatchText] = useState(() => space.batch_sizes.join(", "));
  const [insights, setInsights] = useState<Insights | null>(null);
  const [thinking, setThinking] = useState(false);
  const [spaceNote, setSpaceNote] = useState("");
  const setSpaceField = (patch: Partial<SearchSpace>) => setSpace((s) => ({ ...s, ...patch }));

  const start = async () => {
    setError("");
    setTrials([]);
    setInsights(null);
    setSpaceNote("");
    try {
      const r = await request("/tuning/studies", {
        method: "POST",
        body: JSON.stringify({ model_id: modelId, n_trials: nTrials, dataset, search_space: space }),
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
        if (t.length >= expected && t.every((x) => x.state !== "RUNNING")) stopped = true;
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

  const getInsights = async () => {
    setError("");
    setThinking(true);
    try {
      const r: Insights = await request(`/insights/studies/${studyId}`, { method: "POST" });
      setInsights(r);
    } catch (e: any) {
      setError(e.message);
    }
    setThinking(false);
  };

  const useSpace = (s: SearchSpace) => {
    setSpace(s);
    setBatchText(s.batch_sizes.join(", "));
    setSpaceNote("Search ranges updated from the insights. Start a new study to try them.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const done = trials.filter((t) => t.state === "COMPLETE" && t.accuracy !== null);
  const pruned = trials.filter((t) => t.state === "PRUNED").length;
  let best = 0;
  const bestSoFar = trials.map((t) => {
    if (t.state === "COMPLETE" && t.accuracy !== null) best = Math.max(best, t.accuracy);
    return best || null;
  });
  const bestTrial = done.slice().sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))[0];
  const progress = expected > 0 ? Math.min(100, (trials.filter((t) => t.state !== "RUNNING").length / expected) * 100) : 0;
  const running = studyId !== null && progress < 100;

  return (
    <div className="space-y-8">
      <PageHeader title="Tuning Studio"
        actions={studyId !== null && (
          <Button variant="secondary" disabled={thinking || done.length === 0} onClick={getInsights}>
            {thinking ? "Reading the trials…" : "Get AI insights"}
          </Button>
        )}>
        Let Optuna search learning rate, batch size and weight decay for you, then have Mistral
        and Llama read the trial log and propose a tighter search.
      </PageHeader>

      <Panel title="New study" flush>
        <Section className="border-t-0 pt-0">
          <DatasetPicker value={dataset} onChange={setDataset} preview={false} />
        </Section>
        <Section>
          <p className="mb-3 text-[15px] font-medium text-ink">Search ranges</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Learning rate from">
              <input type="number" step="any" className={inputCls + " num"} value={space.lr_min}
                onChange={(e) => setSpaceField({ lr_min: +e.target.value })} />
            </Field>
            <Field label="Learning rate to">
              <input type="number" step="any" className={inputCls + " num"} value={space.lr_max}
                onChange={(e) => setSpaceField({ lr_max: +e.target.value })} />
            </Field>
            <Field label="Batch sizes">
              <input className={inputCls + " num"} value={batchText} placeholder="16, 32"
                onChange={(e) => {
                  setBatchText(e.target.value);
                  setSpaceField({ batch_sizes: e.target.value.split(",").map((x) => +x.trim()).filter((x) => x > 0) });
                }} />
            </Field>
            <Field label="Weight decay from">
              <input type="number" step="any" className={inputCls + " num"} value={space.wd_min}
                onChange={(e) => setSpaceField({ wd_min: +e.target.value })} />
            </Field>
            <Field label="Weight decay to">
              <input type="number" step="any" className={inputCls + " num"} value={space.wd_max}
                onChange={(e) => setSpaceField({ wd_max: +e.target.value })} />
            </Field>
            <Field label="Epochs per trial">
              <input type="number" className={inputCls + " num"} value={space.epochs}
                onChange={(e) => setSpaceField({ epochs: +e.target.value })} />
            </Field>
          </div>
          {spaceNote && <div className="mt-4"><Notice tone="info" onClose={() => setSpaceNote("")}>{spaceNote}</Notice></div>}
        </Section>
        <Section className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex gap-4">
            <div className="w-28">
              <Field label="Model ID">
                <input type="number" className={inputCls + " num"} value={modelId} onChange={(e) => setModelId(+e.target.value)} />
              </Field>
            </div>
            <div className="w-28">
              <Field label="Trials">
                <input type="number" className={inputCls + " num"} value={nTrials} onChange={(e) => setNTrials(+e.target.value)} />
              </Field>
            </div>
          </div>
          <Button onClick={start} disabled={running}>{running ? "Study running…" : "Start study"}</Button>
        </Section>
        {studyId !== null && expected > 0 && (
          <div className="border-t border-hairline px-6 py-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-spruce transition-[width] duration-700" style={{ width: progress + "%" }} />
            </div>
            <p className="num mt-2 text-[13px] text-graphite">
              Study {studyId}: {trials.filter((t) => t.state !== "RUNNING").length} of {expected} trials finished
            </p>
          </div>
        )}
      </Panel>

      {error && <Notice onClose={() => setError("")}>{error}</Notice>}

      {insights && <InsightsPanel data={insights} onUseSpace={useSpace} onClose={() => setInsights(null)} />}

      {studyId === null && (
        <Empty title="No study running">
          Choose the ranges above and start a study. Each trial fine-tunes the model once, so
          more trials take longer but search more thoroughly.
        </Empty>
      )}

      {studyId !== null && trials.length === 0 && (
        <Empty title="Waiting for the first trial">This page refreshes on its own every few seconds.</Empty>
      )}

      {trials.length > 0 && (
        <>
          <Readout items={[
            { label: "Best accuracy", value: done.length ? best.toFixed(3) : "–",
              note: bestTrial ? `trial ${bestTrial.number}, lr ${bestTrial.learning_rate.toExponential(1)}` : undefined },
            { label: "Trials finished", value: done.length },
            { label: "Stopped early", value: pruned, note: "weak trials cut by the pruner" },
          ]} />

          <Panel title="Search history" description="Each dot is one trial. The line is the best accuracy found so far.">
            <Plot
              data={[
                { x: trials.map((t) => t.number), y: trials.map((t) => t.accuracy), type: "scatter", mode: "markers",
                  name: "Trial", marker: { size: 11, color: trials.map((t) => (t.state === "PRUNED" ? C.rule : C.spruce)),
                    line: { color: "#fff", width: 1.5 } },
                  hovertemplate: "Trial %{x}<br>accuracy %{y:.3f}<extra></extra>" },
                { x: trials.map((t) => t.number), y: bestSoFar, type: "scatter", mode: "lines", name: "Best so far",
                  line: { color: C.brass, width: 2.5, shape: "hv" }, hoverinfo: "skip" },
              ] as any}
              layout={baseLayout({ height: 340, margin: { t: 16, r: 16, b: 48, l: 64 },
                xaxis: { title: { text: "Trial", font: { size: 12 } }, dtick: 1, range: [-0.5, Math.max(expected, trials.length) - 0.5],
                  gridcolor: "rgba(0,0,0,0)", linecolor: C.rule, zeroline: false, tickfont: { color: C.mist } },
                yaxis: { title: { text: "Accuracy", font: { size: 12 } }, gridcolor: C.hairline, zeroline: false, tickfont: { color: C.mist } } }) as any}
              config={plotConfig} useResizeHandler style={{ width: "100%" }}
            />
          </Panel>

          {done.length > 1 && (
            <Panel title="How the settings relate to accuracy"
              description="Each line is one finished trial. Darker lines scored higher; drag along an axis to filter.">
              <Plot
                data={[{
                  type: "parcoords",
                  line: { color: done.map((t) => t.accuracy as number),
                    colorscale: [[0, "#e6ebe8"], [0.5, "#7f9c8e"], [1, "#154236"]], showscale: true,
                    colorbar: { thickness: 10, outlinewidth: 0, tickfont: { color: C.mist } } },
                  labelfont: { color: C.ink, size: 13 }, tickfont: { color: C.mist, size: 11 },
                  dimensions: [
                    { label: "Learning rate", values: done.map((t) => t.learning_rate), tickformat: ".1e" },
                    { label: "Batch size", values: done.map((t) => t.batch_size) },
                    { label: "Weight decay", values: done.map((t) => t.weight_decay) },
                    { label: "Accuracy", values: done.map((t) => t.accuracy as number) },
                  ],
                }] as any}
                layout={baseLayout({ height: 380, margin: { t: 48, r: 48, b: 24, l: 56 } }) as any}
                config={plotConfig} useResizeHandler style={{ width: "100%" }}
              />
            </Panel>
          )}

          <Panel title="Trials" flush
            description="Stopped early means the pruner cut a trial that was falling behind, which saves time.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[14px]">
                <thead>
                  <tr className="border-y border-hairline bg-raised text-[13px] text-graphite">
                    <th className="px-6 py-2.5 font-medium">Trial</th>
                    <th className="px-3 py-2.5 font-medium">State</th>
                    <th className="px-3 py-2.5 text-right font-medium">Learning rate</th>
                    <th className="px-3 py-2.5 text-right font-medium">Batch</th>
                    <th className="px-3 py-2.5 text-right font-medium">Weight decay</th>
                    <th className="px-6 py-2.5 text-right font-medium">Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {trials.map((t) => (
                    <tr key={t.number} className={bestTrial?.number === t.number ? "bg-spruce-soft/40" : ""}>
                      <td className="num px-6 py-3 font-semibold text-ink">{t.number}</td>
                      <td className="px-3"><Status value={t.state} /></td>
                      <td className="num px-3 text-right text-graphite">{t.learning_rate.toExponential(2)}</td>
                      <td className="num px-3 text-right text-graphite">{t.batch_size}</td>
                      <td className="num px-3 text-right text-graphite">{t.weight_decay.toFixed(3)}</td>
                      <td className="num px-6 text-right font-semibold text-ink">{t.accuracy?.toFixed(3) ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
