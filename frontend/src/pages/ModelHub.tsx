import { useEffect, useState } from "react";
import { request } from "../api";
import { Button, Empty, Mono, Notice, PageHeader, Panel, Status } from "../components/ui";

type Model = { id: number; hub_id: string; status: string };
type Pushed = { repo_id: string; url: string; last_modified: string; versions: string[] };

const POPULAR = [
  { id: "distilbert-base-uncased", note: "66M parameters, fastest" },
  { id: "bert-base-uncased", note: "110M, the classic baseline" },
  { id: "roberta-base", note: "125M, strongest on sentiment" },
  { id: "albert-base-v2", note: "12M, smallest download" },
];

export default function ModelHub() {
  const [name, setName] = useState("distilbert-base-uncased");
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pushed, setPushed] = useState<Pushed[]>([]);
  const [hubEnabled, setHubEnabled] = useState<boolean | null>(null);

  const load = () => {
    request("/models").then((r) => setModels(Array.isArray(r) ? r : [])).catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
    request("/hub/models")
      .then((r) => {
        setHubEnabled(!!r?.enabled);
        setPushed(Array.isArray(r?.models) ? r.models : []);
      })
      .catch(() => setHubEnabled(false));
  }, []);

  const importModel = async (hubId: string = name) => {
    setError("");
    setLoading(true);
    try {
      await request("/models/import", { method: "POST", body: JSON.stringify({ hub_id: hubId }) });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Models">
        Bring in a pretrained model from the Hugging Face Hub. It becomes the starting point
        for fine-tuning runs and tuning studies.
      </PageHeader>

      <Panel title="Import a model" description="Any text model on the Hub works. Paste its ID or start from a common choice.">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            aria-label="Hub model ID"
            className="w-full flex-1 rounded-lg border border-rule bg-surface px-3 py-2 font-mono text-[14px] text-ink outline-none transition-colors hover:border-mist focus:border-spruce focus:ring-3 focus:ring-spruce-soft"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) importModel(); }}
          />
          <Button onClick={() => importModel()} disabled={loading || !name.trim()}>
            {loading ? "Importing…" : "Import model"}
          </Button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {POPULAR.map((p) => (
            <button key={p.id} type="button" onClick={() => setName(p.id)}
              className={"rounded-lg border px-3 py-2.5 text-left transition-colors " +
                (name === p.id ? "border-spruce bg-spruce-soft/60" : "border-hairline bg-raised hover:border-rule")}>
              <span className="block font-mono text-[13px] text-ink">{p.id}</span>
              <span className="mt-0.5 block text-xs text-graphite">{p.note}</span>
            </button>
          ))}
        </div>
        {error && <div className="mt-4"><Notice onClose={() => setError("")}>{error}</Notice></div>}
      </Panel>

      <Panel title="Ready to train" flush
        actions={<span className="num text-sm text-graphite">{models.length} {models.length === 1 ? "model" : "models"}</span>}>
        {models.length === 0 ? (
          <div className="px-6 pb-6">
            <Empty title="No models yet">Import one above. Its ID number is what you enter on the Experiments and Tuning Studio pages.</Empty>
          </div>
        ) : (
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr className="border-y border-hairline bg-raised text-[13px] text-graphite">
                <th className="px-6 py-2.5 font-medium">ID</th>
                <th className="px-3 py-2.5 font-medium">Model</th>
                <th className="px-6 py-2.5 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {models.map((m) => (
                <tr key={m.id}>
                  <td className="num px-6 py-3.5 font-semibold text-ink">{m.id}</td>
                  <td className="px-3"><Mono>{m.hub_id}</Mono></td>
                  <td className="px-6 text-right"><Status value={m.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Saved on the Hugging Face Hub" flush
        description="Every finished run is pushed as its own version, tagged job-N, so nothing is lost when the server restarts.">
        {hubEnabled === false ? (
          <p className="px-6 pb-6 text-sm text-graphite">
            Hub storage is off. Add an HF_TOKEN with write access to the backend to turn it on.
          </p>
        ) : pushed.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-graphite">
            {hubEnabled === null ? "Checking the Hub…" : "Nothing pushed yet. Finished runs from the Experiments page appear here."}
          </p>
        ) : (
          <ul className="divide-y divide-hairline border-t border-hairline">
            {pushed.map((m) => (
              <li key={m.repo_id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div className="min-w-0">
                  <a href={m.url} target="_blank" rel="noreferrer"
                    className="font-mono text-[14px] text-spruce underline-offset-2 hover:underline">{m.repo_id}</a>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {m.versions.slice(0, 6).map((v) => (
                      <span key={v} className="rounded-md bg-raised px-2 py-0.5 font-mono text-[12px] text-graphite">{v}</span>
                    ))}
                    {m.versions.length === 0 && <span className="text-xs text-mist">No tagged versions</span>}
                  </div>
                </div>
                <Button variant="secondary" size="sm" disabled={loading} onClick={() => importModel(m.repo_id)}>
                  Import latest
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
