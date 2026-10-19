import { useEffect, useState } from "react";
import { request } from "../api";

type Model = { id: number; hub_id: string; status: string };

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
    <div>
      <h2 className="mb-4 text-2xl font-bold">Model Hub</h2>
      <div className="flex gap-2">
        <input
          className="w-96 rounded border px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="rounded bg-indigo-600 px-4 py-2 text-white"
          onClick={importModel}
          disabled={loading}
        >
          {loading ? "Importing..." : "Import"}
        </button>
      </div>
      {error && <p className="mt-3 text-red-600">{error}</p>}
      <table className="mt-6 w-full text-left">
        <thead>
          <tr className="border-b">
            <th className="py-2">ID</th>
            <th>Model</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.id} className="border-b">
              <td className="py-2">{m.id}</td>
              <td>{m.hub_id}</td>
              <td>{m.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}