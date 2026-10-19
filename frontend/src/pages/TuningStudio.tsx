import { useEffect, useState } from "react";
import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import { request } from "../api";
const Plot = createPlotlyComponent(Plotly);
type Trial = {
number: number; state: string; learning_rate: number;
batch_size: number; weight_decay: number; accuracy: number | null;
};
export default function TuningStudio() {
const [modelId, setModelId] = useState(1);
const [nTrials, setNTrials] = useState(3);
const [studyId, setStudyId] = useState<number | null>(null);
const [expected, setExpected] = useState(0);
const [trials, setTrials] = useState<Trial[]>([]);
const [error, setError] = useState("");
const [suggestion, setSuggestion] = useState("");
const start = async () => {
setError(""); setTrials([]); setSuggestion("");
try {
const r = await request("/tuning/studies", {
method: "POST", body: JSON.stringify({ model_id: modelId, n_trials: nTrials
}),
});
setExpected(nTrials);
setStudyId(r.id);
} catch (e: any) { setError(e.message); }
};
useEffect(() => {
if (!studyId) return;
let stopped = false;
const tick = async () => {
try {
const t: Trial[] = await request(`/tuning/studies/${studyId}/trials`);
setTrials(t);
if (t.length >= expected && t.every((x) => x.state !== "RUNNING")) stopped =
true;
} catch (e: any) { setError(e.message); stopped = true; }
};
tick();
const id = setInterval(() => { if (stopped) clearInterval(id); else tick(); },
4000);
return () => clearInterval(id);
}, [studyId, expected]);
const getSuggestion = async () => {
try {
const r = await request("/suggestions", { method: "POST", body: JSON.stringify({
study_id: studyId }) });
setSuggestion(r.suggestion);
} catch (e: any) { setError(e.message); }
};
const done = trials.filter((t) => t.state === "COMPLETE" && t.accuracy !== null);
let best = 0;
const bestSoFar = trials.map((t) => {
if (t.state === "COMPLETE" && t.accuracy !== null) best = Math.max(best,
t.accuracy);
return best || null;
});
return (
<div>
<h2 className="mb-4 text-2xl font-bold">Tuning Studio</h2>
<div className="flex items-end gap-3">
<label>Model id<input type="number"
className="ml-2 w-20 rounded border px-2 py-1"
value={modelId} onChange={(e) => setModelId(+e.target.value)} /></label>
<label>Trials<input type="number"
className="ml-2 w-20 rounded border px-2 py-1"
value={nTrials} onChange={(e) => setNTrials(+e.target.value)} /></label>
<button className="rounded bg-indigo-600 px-4 py-2 text-white"
onClick={start}>Start study</button>
{studyId && <button className="rounded border px-4 py-2"
onClick={getSuggestion}>Get suggestion</button>}
</div>
{error && <p className="mt-3 text-red-600">{error}</p>}
{suggestion && <p className="mt-3 rounded bg-amber-50 p-3">{suggestion}</p>}
{studyId && trials.length === 0 && <p className="mt-4 text-slate-500">Waiting
for the first trial...</p>}
{trials.length > 0 && (
<>
<Plot
data={[
{ x: trials.map((t) => t.number), y: trials.map((t) => t.accuracy),
type: "scatter", mode: "markers", name: "Trial accuracy",
marker: { size: 10, color: trials.map((t) => (t.state === "PRUNED" ?
"#9ca3af" : "#4338ca")) } },
{ x: trials.map((t) => t.number), y: bestSoFar,
type: "scatter", mode: "lines", name: "Best so far" },
] as any}
layout={{ title: { text: "Optimization history" }, xaxis: { title: { text:
"Trial" }, dtick: 1 },
yaxis: { title: { text: "Accuracy" } }, height: 360 }}
style={{ width: "100%" }}
/>
{done.length > 1 && (
<Plot
data={[{
type: "parcoords",
line: { color: done.map((t) => t.accuracy as number), colorscale:
"Viridis", showscale: true },
dimensions: [
{ label: "Learning rate", values: done.map((t) => t.learning_rate)
},
{ label: "Batch size", values: done.map((t) => t.batch_size) },
{ label: "Weight decay", values: done.map((t) => t.weight_decay) },
{ label: "Accuracy", values: done.map((t) => t.accuracy as number)
},
],
}] as any}
layout={{ title: { text: "Parallel coordinates" }, height: 380 }}
style={{ width: "100%" }}
/>
)}
<p className="mt-4 text-sm text-slate-500">
PRUNED means the tuning tool stopped a weak trial early to save time. This
is normal.
</p>
<table className="mt-2 w-full text-left">
<thead><tr className="border-b"><th
className="py-2">Trial</th><th>State</th><th>Learning rate</th>
<th>Batch</th><th>Weight decay</th><th>Accuracy</th></tr></thead>
<tbody>
{trials.map((t) => (
<tr key={t.number} className="border-b">
<td className="py-2">{t.number}</td>
<td><span className={"rounded px-2 py-0.5 text-sm " + (t.state ===
"COMPLETE" ? "bg-green-100"
: t.state === "PRUNED" ? "bg-slate-200" :
"bg-blue-100")}>{t.state}</span></td>
<td>{t.learning_rate.toExponential(2)}</td><td>{t.batch_size}</td>
<td>{t.weight_decay.toFixed(3)}</td><td>{t.accuracy?.toFixed(3) ??
"-"}</td>
</tr>
))}
</tbody>
</table>
</>
)}
</div>
);
}