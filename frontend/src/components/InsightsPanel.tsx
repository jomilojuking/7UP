import type { Insights, SearchSpace } from "../types";
import { Button } from "./ui";

const fmt = (s: SearchSpace) =>
  `learning rate ${s.lr_min.toExponential(1)} to ${s.lr_max.toExponential(1)}, ` +
  `batch ${s.batch_sizes.join(" or ")}, weight decay ${s.wd_min} to ${s.wd_max}, ${s.epochs} epochs`;

const shortName = (model: string) => model.split("/").pop() ?? model;

/** LLM answers side by side, the rule-based check, and the recommended next search. */
export default function InsightsPanel({ data, onUseSpace, onClose, title = "AI insights",
                                        useLabel = "Use these ranges" }: {
  data: Insights;
  onUseSpace?: (space: SearchSpace) => void;
  onClose?: () => void;
  title?: string;
  useLabel?: string;
}) {
  const answered = data.llm.filter((a) => a.ok);
  return (
    <section className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-panel" aria-label={title}>
      <div className="flex items-start justify-between gap-4 border-l-4 border-spruce px-6 pt-5 pb-4">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-sm text-graphite">
            {data.source === "llm"
              ? `Written by ${answered.map((a) => shortName(a.model)).join(" and ")} from your results.`
              : "From the built-in rules. No language model answered, so check HF_TOKEN and credits on the backend."}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="text-mist transition-colors hover:text-ink">✕</button>
        )}
      </div>

      {data.llm.length > 0 && (
        <div className={"grid gap-px border-t border-hairline bg-hairline " + (data.llm.length > 1 ? "md:grid-cols-2" : "")}>
          {data.llm.map((a) => (
            <article key={a.model} className="bg-surface px-6 py-5">
              <p className="font-mono text-[12px] text-spruce">{shortName(a.model)}</p>
              {a.ok ? (
                <>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink">{a.summary}</p>
                  {!!a.recommendations?.length && (
                    <ul className="mt-3 space-y-1.5 text-[14px] text-graphite">
                      {a.recommendations.map((r, i) => (
                        <li key={i} className="flex gap-2"><span className="text-spruce">–</span>{r}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-mist">Did not answer: {a.error}</p>
              )}
            </article>
          ))}
        </div>
      )}

      <div className="border-t border-hairline bg-raised px-6 py-5">
        <p className="text-[13px] font-medium text-graphite">Rule-based check</p>
        <p className="mt-1 text-[15px] text-ink">{data.rule_based.summary}</p>
        {data.rule_based.recommendations.length > 0 && (
          <ul className="mt-2 space-y-1 text-[14px] text-graphite">
            {data.rule_based.recommendations.map((r, i) => (
              <li key={i} className="flex gap-2"><span className="text-spruce">–</span>{r}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline px-6 py-4">
        <p className="text-[14px] text-ink">
          <span className="font-medium">Next search:</span>{" "}
          <span className="num text-graphite">{fmt(data.recommended_search_space)}</span>
        </p>
        {onUseSpace && <Button onClick={() => onUseSpace(data.recommended_search_space)}>{useLabel}</Button>}
      </div>
    </section>
  );
}
