import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import { baseLayout, C, classColor, plotConfig } from "../chart";
import type { Profile } from "../types";
import { Panel, Readout } from "./ui";

const Plot = createPlotlyComponent(Plotly);

const pct = (n: number, total: number) => (total ? (100 * n) / total : 0);
const fmt = (n: number) => n.toLocaleString();

/** One split drawn as a single ribbon; each class is a segment sized by its share. */
function Ribbon({ label, counts, names, delay = 0 }: {
  label: string; counts: number[]; names: string[]; delay?: number;
}) {
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-4 sm:grid-cols-[120px_1fr]">
      <div>
        <p className="text-[15px] font-medium text-ink">{label}</p>
        <p className="num text-[13px] text-mist">{fmt(total)} rows</p>
      </div>
      <div className="grow-x flex h-11 overflow-hidden rounded-lg" style={{ animationDelay: `${delay}ms` }}
        role="img" aria-label={`${label}: ` + names.map((n, i) => `${n} ${pct(counts[i], total).toFixed(0)}%`).join(", ")}>
        {counts.map((c, i) => {
          const share = pct(c, total);
          return share > 0 ? (
            <div key={i} title={`${names[i]}: ${fmt(c)} (${share.toFixed(1)}%)`}
              className="flex min-w-0 items-center px-3 text-white first:rounded-l-lg last:rounded-r-lg"
              style={{ width: `${share}%`, background: classColor(i), marginRight: i < counts.length - 1 ? 2 : 0 }}>
              {share >= 9 && (
                <span className="num truncate text-[13px] font-medium">
                  <span className="hidden sm:inline">{names[i]} </span><span className="sm:opacity-75">{share.toFixed(0)}%</span>
                </span>
              )}
            </div>
          ) : null;
        })}
      </div>
    </div>
  );
}

export function ClassBalance({ p }: { p: Profile }) {
  const tr = p.train.counts.reduce((a, b) => a + b, 0);
  const ratio = Math.max(...p.train.counts) / Math.max(1, Math.min(...p.train.counts));
  const verdict = ratio < 1.5 ? "Classes are well balanced, so accuracy is a fair headline metric."
    : ratio < 4 ? "Mild imbalance. Watch F1 alongside accuracy."
    : "Strong imbalance. Accuracy can look good while rare classes are missed, so judge runs by F1.";
  return (
    <div className="space-y-4">
      <Ribbon label="Training" counts={p.train.counts} names={p.label_names} />
      <Ribbon label="Evaluation" counts={p.eval.counts} names={p.label_names} delay={120} />
      <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1 sm:pl-[136px]">
        {p.label_names.map((n, i) => (
          <span key={n} className="flex items-center gap-2 text-[13px] text-graphite">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: classColor(i) }} />
            <span className="text-ink">{n}</span>
            <span className="num">{fmt(p.train.counts[i])} ({pct(p.train.counts[i], tr).toFixed(1)}%)</span>
          </span>
        ))}
      </div>
      <p className="text-sm text-graphite sm:pl-[136px]">{verdict}</p>
    </div>
  );
}

function LengthChart({ p }: { p: Profile }) {
  const { edges, counts, median, p95 } = p.length;
  const mids = counts.map((_, i) => (edges[i] + edges[i + 1]) / 2);
  const width = edges[1] - edges[0];
  const ymax = Math.max(...counts, 1);
  return (
    <Plot
      data={[{
        type: "bar", x: mids, y: counts, width: width * 0.86,
        marker: { color: C.spruce, opacity: 0.85 },
        hovertemplate: "%{x:.0f} words<br>%{y} rows<extra></extra>",
      }] as any}
      layout={baseLayout({
        height: 260, bargap: 0.05, showlegend: false,
        margin: { t: 24, r: 12, b: 40, l: 44 },
        xaxis: { title: { text: "Words per example", font: { size: 12 } }, gridcolor: "rgba(0,0,0,0)", linecolor: C.rule, tickfont: { color: C.mist } },
        yaxis: { gridcolor: C.hairline, zeroline: false, tickfont: { color: C.mist } },
        shapes: [
          { type: "line", x0: median, x1: median, y0: 0, y1: ymax * 1.08, line: { color: C.brass, width: 2 } },
          { type: "line", x0: p95, x1: p95, y0: 0, y1: ymax * 1.08, line: { color: C.mist, width: 1, dash: "dot" } },
        ],
        annotations: [
          { x: median, y: ymax * 1.08, text: `median ${median}`, showarrow: false, xanchor: "left", xshift: 4, font: { color: "#7a5a1c", size: 12 } },
          { x: p95, y: ymax * 0.92, text: `95% under ${p95}`, showarrow: false, xanchor: "left", xshift: 4, font: { color: C.graphite, size: 12 } },
        ],
      }) as any}
      config={plotConfig} useResizeHandler style={{ width: "100%" }}
    />
  );
}

function LengthByClass({ p }: { p: Profile }) {
  const max = Math.max(...p.length.mean_by_label, 1);
  const stats = [
    { label: "Median", value: p.length.median },
    { label: "Mean", value: p.length.mean },
    { label: "95% of examples under", value: p.length.p95 },
    { label: "Longest", value: p.length.max },
  ];
  return (
    <div className="space-y-6">
    <ul className="space-y-3">
      {p.label_names.map((n, i) => (
        <li key={n}>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-ink">{n}</span>
            <span className="num text-graphite">{p.length.mean_by_label[i]} words</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-raised">
            <div className="grow-x h-2 rounded-full" style={{ width: `${(100 * p.length.mean_by_label[i]) / max}%`, background: classColor(i) }} />
          </div>
        </li>
      ))}
    </ul>
    <dl className="space-y-2 border-t border-hairline pt-4">
      {stats.map((st) => (
        <div key={st.label} className="flex items-baseline justify-between text-[14px]">
          <dt className="text-graphite">{st.label}</dt>
          <dd className="num font-medium text-ink">{st.value} words</dd>
        </div>
      ))}
    </dl>
    </div>
  );
}

function TopWords({ p }: { p: Profile }) {
  const shown = p.label_names.slice(0, 4);
  return (
    <div className={"grid gap-x-8 gap-y-6 " + (shown.length > 2 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2")}>
      {shown.map((n, i) => {
        const words = p.top_words[i] ?? [];
        const max = Math.max(...words.map((w) => w.count), 1);
        return (
          <div key={n}>
            <p className="flex items-center gap-2 text-[15px] font-medium text-ink">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: classColor(i) }} />
              {n}
            </p>
            {words.length === 0 ? (
              <p className="mt-2 text-sm text-mist">Not enough text to rank words.</p>
            ) : (
              <ol className="mt-3 space-y-1.5">
                {words.map((w) => (
                  <li key={w.word} className="relative flex items-baseline justify-between rounded-md px-2 py-1 text-[14px]">
                    <span className="absolute inset-y-0 left-0 rounded-md opacity-[0.13]"
                      style={{ width: `${(100 * w.count) / max}%`, background: classColor(i) }} />
                    <span className="relative text-ink">{w.word}</span>
                    <span className="num relative text-[12px] text-mist">{w.count}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Examples({ p }: { p: Profile }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {p.label_names.slice(0, 4).map((n, i) => (
        <div key={n}>
          <p className="text-[13px] font-medium" style={{ color: classColor(i) }}>{n}</p>
          <ul className="mt-2 space-y-3">
            {(p.examples[i] ?? []).map((t, j) => (
              <li key={j} className="border-l-2 pl-3 text-[15px] leading-relaxed text-ink"
                style={{ borderColor: classColor(i) }}>
                {t}
              </li>
            ))}
            {(p.examples[i] ?? []).length === 0 && <li className="text-sm text-mist">No short examples in the sample.</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Full dataset profile: readout, class balance, lengths, words, examples. */
export default function DatasetProfile({ p }: { p: Profile }) {
  return (
    <div className="space-y-6">
      <Readout items={[
        { label: "Training rows", value: fmt(p.train.rows), note: `sample of up to ${fmt(p.sampled.train_limit)}` },
        { label: "Evaluation rows", value: fmt(p.eval.rows), note: p.eval_source },
        { label: "Classes", value: p.label_names.length },
        { label: "Median length", value: <>{p.length.median}<span className="ml-1 text-base font-normal text-graphite">words</span></>, note: `mean ${p.length.mean}` },
      ]} />

      <Panel title="Class balance" description="How each split divides between labels. Training and evaluation should look alike.">
        <ClassBalance p={p} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Text length" description="Words per training example. Inputs longer than 128 tokens are truncated during training.">
          <LengthChart p={p} />
        </Panel>
        <Panel title="Length by class" description="Average words per example. Large gaps mean length alone hints at the label.">
          <LengthByClass p={p} />
        </Panel>
      </div>

      <Panel title="Words that set each class apart" description="Frequent in a class and more common there than in the rest of the data. Common filler words are skipped.">
        <TopWords p={p} />
      </Panel>

      <Panel title="Examples from the data">
        <Examples p={p} />
      </Panel>
    </div>
  );
}
