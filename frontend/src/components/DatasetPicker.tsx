import { useState } from "react";
import { Link } from "react-router-dom";
import { request, upload } from "../api";
import { isComplete, saveDataset, SST2, type DatasetSpec } from "../types";
import { ClassBalance } from "./DatasetProfile";
import { Button, Field, inputCls, Notice } from "./ui";
import { useProfile } from "./useProfile";

type Mode = "sst2" | "hub" | "csv";

type Inspect = {
  splits: Record<string, number>;
  columns: { name: string; type: string }[];
  suggested_text_column: string | null;
  suggested_label_column: string | null;
};

type Uploaded = { upload_id: number; filename: string; rows: number; columns: string[] };

function ColumnSelect({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      {options.length > 0 ? (
        <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
          {!options.includes(value) && <option value={value}>{value || "Pick a column"}</option>}
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

const MODES: { id: Mode; label: string }[] = [
  { id: "sst2", label: "SST-2" },
  { id: "hub", label: "Hub dataset" },
  { id: "csv", label: "Upload CSV" },
];

/** Choose SST-2, any Hugging Face dataset, or an uploaded CSV, and preview it. */
export default function DatasetPicker({ value, onChange, preview = true }: {
  value: DatasetSpec;
  onChange: (spec: DatasetSpec) => void;
  preview?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(
    value.upload_id != null ? "csv" : value.hub_id === SST2.hub_id ? "sst2" : "hub"
  );
  const [info, setInfo] = useState<Inspect | null>(null);
  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const prof = useProfile();

  const change = (spec: DatasetSpec) => {
    saveDataset(spec);
    prof.clear();
    onChange(spec);
  };
  const set = (patch: Partial<DatasetSpec>) => change({ ...value, ...patch });

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    if (m === "sst2") change(SST2);
    if (m === "hub") change({ ...SST2, hub_id: "", text_column: "text" });
    if (m === "csv")
      change({ upload_id: uploaded?.upload_id ?? null, hub_id: null,
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
      change({
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
      change({ upload_id: r.upload_id, hub_id: null, text_column: r.columns[0],
               label_column: r.columns[1], eval_split: null });
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const hubColumns = info ? info.columns.map((c) => c.name) : [];
  const splitNames = info ? Object.keys(info.splits) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <div role="tablist" aria-label="Data source"
          className="grid w-full grid-cols-3 rounded-lg border border-rule bg-raised p-1 sm:inline-flex sm:w-auto">
          {MODES.map((m) => (
            <button key={m.id} role="tab" type="button" aria-selected={mode === m.id}
              onClick={() => switchMode(m.id)}
              className={"whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] transition-colors sm:px-3 sm:text-[14px] " +
                (mode === m.id ? "bg-surface font-medium text-ink shadow-panel" : "text-graphite hover:text-ink")}>
              {m.label}
            </button>
          ))}
        </div>
        {mode === "sst2" && (
          <p className="text-sm text-graphite">Movie-review sentences labelled positive or negative.</p>
        )}
      </div>

      {mode === "hub" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
            <Field label="Dataset ID">
              <input className={inputCls + " font-mono text-[14px]"} placeholder="imdb, ag_news, tweet_eval"
                value={value.hub_id ?? ""} onChange={(e) => set({ hub_id: e.target.value })} />
            </Field>
            <Field label="Config (if the dataset has several)">
              <input className={inputCls} placeholder="emotion"
                value={value.config ?? ""} onChange={(e) => set({ config: e.target.value || null })} />
            </Field>
            <Button variant="secondary" disabled={!value.hub_id || busy} onClick={inspect}>
              {busy ? "Reading…" : "Read columns"}
            </Button>
          </div>
          {info && (
            <p className="num text-sm text-graphite">
              Splits: {Object.entries(info.splits).map(([k, n]) => `${k} (${n.toLocaleString()})`).join(", ") || "unknown"}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <ColumnSelect label="Text column" value={value.text_column} options={hubColumns}
              onChange={(v) => set({ text_column: v })} />
            <ColumnSelect label="Label column" value={value.label_column} options={hubColumns}
              onChange={(v) => set({ label_column: v })} />
            <ColumnSelect label="Training split" value={value.train_split ?? "train"} options={splitNames}
              onChange={(v) => set({ train_split: v })} />
            <ColumnSelect label="Evaluation split" value={value.eval_split ?? ""} options={splitNames}
              onChange={(v) => set({ eval_split: v || null })} />
          </div>
        </div>
      )}

      {mode === "csv" && (
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-rule bg-raised px-6 py-7 text-center transition-colors hover:border-spruce">
            <span className="text-[15px] font-medium text-ink">
              {uploaded ? uploaded.filename : busy ? "Uploading…" : "Choose a CSV file"}
            </span>
            <span className="mt-1 text-sm text-graphite">
              {uploaded ? `${uploaded.rows.toLocaleString()} rows. 10% is held out for evaluation.`
                : "One column of text and one column of labels, up to 20 MB."}
            </span>
            <input type="file" accept=".csv,text/csv" disabled={busy} className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {uploaded && (
            <div className="grid grid-cols-2 gap-4">
              <ColumnSelect label="Text column" value={value.text_column} options={uploaded.columns}
                onChange={(v) => set({ text_column: v })} />
              <ColumnSelect label="Label column" value={value.label_column} options={uploaded.columns}
                onChange={(v) => set({ label_column: v })} />
            </div>
          )}
        </div>
      )}

      {error && <Notice onClose={() => setError("")}>{error}</Notice>}

      {preview && (
        <div className="rounded-xl bg-raised px-5 py-4">
          {prof.profile ? (
            <div className="space-y-3">
              <ClassBalance p={prof.profile} />
              <p className="text-sm text-graphite sm:pl-[136px]">
                Median length {prof.profile.length.median} words.{" "}
                <Link to="/datasets" className="font-medium text-spruce underline-offset-2 hover:underline">
                  See the full profile
                </Link>
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-graphite">
                {prof.error ? prof.error : "Check the class balance before you train."}
              </p>
              <Button variant="quiet" size="sm" disabled={!isComplete(value) || prof.loading}
                onClick={() => prof.load(value)}>
                {prof.loading ? "Profiling…" : "Preview data"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
