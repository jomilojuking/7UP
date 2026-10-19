import { useEffect, useRef, useState } from "react";
import { request } from "../api";

type Saved = { id: number; lr: number; batch: number; epochs: number };
type Job = { id: number; status: string; accuracy: number | null };
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
    } catch (e) {
      setError((e as Error).message);
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
        } catch (e) {
          if (String((e as Error).message).includes("Unknown")) {
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
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold">Experiments</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label>
          Model id
          <input
            type="number"
            className="ml-2 w-20 rounded border px-2 py-1"
            value={modelId}
            onChange={(e) => setModelId(+e.target.value)}
          />
        </label>
        <label>
          Learning rate
          <input
            type="number"
            step="any"
            className="ml-2 w-28 rounded border px-2 py-1"
            value={lr}
            onChange={(e) => setLr(+e.target.value)}
          />
        </label>
        <label>
          Batch size
          <input
            type="number"
            className="ml-2 w-20 rounded border px-2 py-1"
            value={batch}
            onChange={(e) => setBatch(+e.target.value)}
          />
        </label>
        <label>
          Epochs
          <input
            type="number"
            className="ml-2 w-16 rounded border px-2 py-1"
            value={epochs}
            onChange={(e) => setEpochs(+e.target.value)}
          />
        </label>
        <button
          className="rounded bg-indigo-600 px-4 py-2 text-white"
          onClick={start}>
          Start run
        </button>
      </div>
      {error && <p className="mt-3 text-red-600">{error}</p>}

      <table className="mt-6 w-full text-left">
        <thead>
          <tr className="border-b">
            <th className="py-2">Pick</th>
            <th>Run</th>
            <th>Learning rate</th>
            <th>Batch</th>
            <th>Epochs</th>
            <th>Status</th>
            <th>Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {saved.map((s) => {
            const j = jobs[s.id];
            const gone = j === null;
            const done = !!j && j.status === "done";
            return (
              <tr key={s.id} className="border-b">
                <td className="py-2">
                  <input
                    type="checkbox"
                    disabled={!done}
                    checked={picked.includes(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                </td>
                <td>{s.id}</td>
                <td>{s.lr}</td>
                <td>{s.batch}</td>
                <td>{s.epochs}</td>
                <td>{gone ? "(backend restarted)" : j ? j.status : "..."}</td>
                <td>{j && j.accuracy != null ? j.accuracy.toFixed(3) : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {saved.length === 0 && (
        <p className="mt-3 text-slate-500">No runs yet. Start one above.</p>
      )}

      {picked.length === 2 && (
        <button
          className="mt-4 rounded border px-4 py-2"
          onClick={compare}>
          Compare runs {picked[0]} and {picked[1]}
        </button>
      )}

      {ab && (
        <div className="mt-4 rounded bg-amber-50 p-4">
          <p>
            Accuracy A: {ab.accuracy_a?.toFixed(3) ?? "-"} | Accuracy B:{" "}
            {ab.accuracy_b?.toFixed(3) ?? "-"} | p-value:{" "}
            {ab.p_value?.toFixed(4) ?? "-"}
          </p>
          <p className="mt-2 font-semibold">
            {ab.verdict ?? "Waiting for the result..."}
          </p>
        </div>
      )}
    </div>
  );
}