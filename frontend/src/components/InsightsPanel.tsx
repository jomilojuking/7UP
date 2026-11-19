import type { Insights, SearchSpace } from "../types";

const fmt = (s: SearchSpace) =>
  `lr ${s.lr_min.toExponential(1)}-${s.lr_max.toExponential(1)}, batch ${s.batch_sizes.join("/")}, ` +
  `weight decay ${s.wd_min}-${s.wd_max}, ${s.epochs} epochs`;

function shortName(model: string) {
  return model.split("/").pop() ?? model;
}

/** Shows the LLM answers side by side, the rule-based analysis, and the
 *  recommended search space with a button to use it for the next study. */
export default function InsightsPanel({ data, onUseSpace, onClose }: {
  data: Insights;
  onUseSpace?: (space: SearchSpace) => void;
  onClose?: () => void;
}) {
  const answered = data.llm.filter((a) => a.ok);
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-900">AI insights</h3>
          <p className="mt-1 text-xs text-slate-500">
            {data.source === "llm"
              ? `From ${answered.map((a) => shortName(a.model)).join(" and ")} on the Hugging Face Inference API`
              : "Rule-based analysis (no LLM answered; set HF_TOKEN on the backend to enable it)"}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close insights"
            className="text-slate-400 transition hover:text-slate-600">x</button>
        )}
      </div>

      <div className={"mt-4 grid gap-4 " + (data.llm.length > 1 ? "md:grid-cols-2" : "")}>
        {data.llm.map((a) => (
          <div key={a.model} className="rounded-xl bg-white p-4 shadow-sm">
            <p className="font-mono text-xs font-semibold text-indigo-700">{shortName(a.model)}</p>
            {a.ok ? (
              <>
                <p className="mt-2 text-sm text-slate-700">{a.summary}</p>
                {!!a.recommendations?.length && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {a.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}
                {a.search_space && (
                  <p className="mt-3 text-xs text-slate-500">Suggests: {fmt(a.search_space)}</p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Unavailable: {a.error}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-white/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rule-based check</p>
        <p className="mt-1 text-sm text-slate-700">{data.rule_based.summary}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {data.rule_based.recommendations.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Recommended next search:</span> {fmt(data.recommended_search_space)}
        </p>
        {onUseSpace && (
          <button onClick={() => onUseSpace(data.recommended_search_space)}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500">
            Use these ranges
          </button>
        )}
      </div>
    </section>
  );
}
