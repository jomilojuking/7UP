import { useEffect, useState } from "react";
import { request } from "../api";


type Model = { id: number; hub_id: string; status: string };


const POPULAR = [
  "distilbert-base-uncased",
  "bert-base-uncased",
  "roberta-base",
  "albert-base-v2",
];


export default function ModelHub() {
  const [name, setName] = useState("distilbert-base-uncased");
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);


  const load = () => {
    request("/models")
      .then(setModels)
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, []);


  const importModel = async () => {
    setError("");
    setLoading(true);
    try {
      await request("/models/import", {
        method: "POST",
        body: JSON.stringify({ hub_id: name }),
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };


  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Model Hub
        </h2>
        <p className="mt-2 max-w-2xl text-slate-500">
          Pull a pretrained model from the Hugging Face Hub to use as the
          starting point for tuning and experiments.
        </p>
      </header>


      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h3 className="font-semibold text-slate-900">Import a model</h3>
          <p className="mt-1 text-sm text-slate-500">
            Paste any Hub model id, or pick a popular one below.
          </p>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Hub model id
            </span>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="w-full flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) importModel();
                }}
              />
              <button
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={importModel}
                disabled={loading}>
                {loading ? "Importing..." : "Import model"}
              </button>
            </div>
          </div>


          <div className="flex flex-wrap gap-2">
            {POPULAR.map((p) => (
              <button
                key={p}
                onClick={() => setName(p)}
                className={
                  "rounded-full border px-3 py-1 font-mono text-xs transition " +
                  (name === p
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                }>
                {p}
              </button>
            ))}
          </div>


          {error && (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <span>{error}</span>
              <button
                className="text-rose-400 transition hover:text-rose-600"
                onClick={() => setError("")}
                aria-label="Dismiss error">
                x
              </button>
            </div>
          )}
        </div>
      </section>


      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <h3 className="font-semibold text-slate-900">Your models</h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {models.length} {models.length === 1 ? "model" : "models"}
          </span>
        </div>


        {models.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-semibold text-slate-900">No models yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Import your first model above to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">ID</th>
                  <th className="px-3 font-semibold">Model</th>
                  <th className="px-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {models.map((m) => (
                  <tr key={m.id} className="transition hover:bg-slate-50/70">
                    <td className="px-6 py-3 font-medium text-slate-900">
                      {m.id}
                    </td>
                    <td className="px-3 font-mono text-slate-700">{m.hub_id}</td>
                    <td className="px-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}