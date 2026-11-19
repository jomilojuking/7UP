import { useState } from "react";
import { request, upload } from "../api";
import { SST2, type DatasetSpec } from "../types";

type Mode = "sst2" | "hub" | "csv";

type Inspect = {
  splits: Record<string, number>;
  columns: { name: string; type: string }[];
  suggested_text_column: string | null;
  suggested_label_column: string | null;
};

type Uploaded = { upload_id: number; filename: string; rows: number; columns: string[] };

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm " +
  "text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white " +
  "focus:ring-4 focus:ring-indigo-100";

const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500";

function ColumnSelect({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {options.length > 0 ? (
        <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
          {!options.includes(value) && <option value={value}>{value || "pick a column"}</option>}
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

/** Choose SST-2, any Hugging Face dataset, or an uploaded CSV. */
export default function DatasetPicker({ value, onChange }: {
  value: DatasetSpec;
  onChange: (spec: DatasetSpec) => void;
}) {
  const [mode, setMode] = useState<Mode>(
    value.upload_id != null ? "csv" : value.hub_id === SST2.hub_id ? "sst2" : "hub"
  );
  const [info, setInfo] = useState<Inspect | null>(null);
  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (patch: Partial<DatasetSpec>) => onChange({ ...value, ...patch });

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    if (m === "sst2") onChange(SST2);
    if (m === "hub") onChange({ ...SST2, hub_id: "", text_column: "text" });
    if (m === "csv")
      onChange({ upload_id: uploaded?.upload_id ?? null, hub_id: null,
                 text_column: uploaded?.columns[0] ?? "text",
                 label_column: uploaded?.columns[1] ?? "label", eval_split: null });
  };

  const inspect = async () => {
    setBusy(true);
    setError("");
    try {
      const r: Inspect = await request("/datasets/inspect", {
        method: "POST",
        body: JSON.stringify({ hub_id: value.hub_id, config: value.config || null }),
      });
      setInfo(r);
      const splits = Object.keys(r.splits);
      onChange({
        ...value,
        text_column: r.suggested_text_column ?? value.text_column,
        label_column: r.suggested_label_column ?? value.label_column,
        train_split: splits.includes("train") ? "train" : splits[0] ?? "train",
        eval_split: ["validation", "test"].find((s) => splits.includes(s)) ?? null,
      });
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const r: Uploaded = await upload("/datasets/upload", file);
      setUploaded(r);
      onChange({ upload_id: r.upload_id, hub_id: null, text_column: r.columns[0],
                 label_column: r.columns[1], eval_split: null });
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const tab = (m: Mode, text: string) => (
    <button
      type="button"
      onClick={() => switchMode(m)}
      className={
        "rounded-full border px-3 py-1 text-xs font-medium transition " +
        (mode === m
          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
      }>
      {text}
    </button>
  );

  const hubColumns = info ? info.columns.map((c) => c.name) : [];
  const splitNames = info ? Object.keys(info.splits) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={labelCls + " mb-0 mr-1"}>Dataset</span>
        {tab("sst2", "SST-2 (default)")}
        {tab("hub", "Hugging Face dataset")}
        {tab("csv", "Upload CSV")}
      </div>

      {mode === "sst2" && (
        <p className="text-sm text-slate-500">
          Binary movie-review sentiment from GLUE: <code>sentence</code> to <code>label</code>.
        </p>
      )}

      {mode === "hub" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
            <label className="block">
              <span className={labelCls}>Dataset id</span>
              <input className={inputCls + " font-mono"} placeholder="e.g. imdb, ag_news, tweet_eval"
                value={value.hub_id ?? ""} onChange={(e) => set({ hub_id: e.target.value })} />
            </label>
            <label className="block">
              <span className={labelCls}>Config (optional)</span>
              <input className={inputCls} placeholder="e.g. emotion"
                value={value.config ?? ""} onChange={(e) => set({ config: e.target.value || null })} />
            </label>
            <button type="button" disabled={!value.hub_id || busy} onClick={inspect}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
              {busy ? "Checking..." : "Inspect"}
            </button>
          </div>
          {info && (
            <p className="text-xs text-slate-500">
              Splits: {Object.entries(info.splits).map(([k, n]) => `${k} (${n.toLocaleString()})`).join(", ") || "unknown"}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <ColumnSelect label="Text column" value={value.text_column} options={hubColumns}
              onChange={(v) => set({ text_column: v })} />
            <ColumnSelect label="Label column" value={value.label_column} options={hubColumns}
              onChange={(v) => set({ label_column: v })} />
            <ColumnSelect label="Train split" value={value.train_split ?? "train"} options={splitNames}
              onChange={(v) => set({ train_split: v })} />
            <ColumnSelect label="Eval split" value={value.eval_split ?? ""} options={splitNames}
              onChange={(v) => set({ eval_split: v || null })} />
          </div>
        </div>
      )}

      {mode === "csv" && (
        <div className="space-y-4">
          <input type="file" accept=".csv,text/csv" disabled={busy}
            onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100" />
          {uploaded && (
            <>
              <p className="text-xs text-slate-500">
                {uploaded.filename}: {uploaded.rows.toLocaleString()} rows. 10% is held out for evaluation.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <ColumnSelect label="Text column" value={value.text_column} options={uploaded.columns}
                  onChange={(v) => set({ text_column: v })} />
                <ColumnSelect label="Label column" value={value.label_column} options={uploaded.columns}
                  onChange={(v) => set({ label_column: v })} />
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
    </div>
  );
}
