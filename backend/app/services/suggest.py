import os
import optuna
from app.services.tuning import STORAGE


def suggest(study_name):
    study = optuna.load_study(study_name=study_name, storage=STORAGE)
    done = [t for t in study.trials if t.value is not None]
    if len(done) < 3:
        return {"source": "rule", "suggestion": "Run at least 3 completed trials first."}

    best = sorted(done, key=lambda t: t.value, reverse=True)[:3]
    summary = "\n".join(
        f"lr={t.params['learning_rate']:.2e}, batch={t.params['batch_size']}, "
        f"wd={t.params['weight_decay']:.3f}, accuracy={t.value:.3f}" for t in best
    )
    lr = best[0].params["learning_rate"]
    rule = (f"Best learning rate so far is {lr:.2e}. Narrow the search range "
            f"to about {lr / 2:.1e} to {lr * 2:.1e}.")

    token = os.getenv("HF_TOKEN")
    if token:
        try:
            from huggingface_hub import InferenceClient
            client = InferenceClient(token=token)
            out = client.chat_completion(
                model=os.getenv("SUGGEST_MODEL", "meta-llama/Llama-3.2-3B-Instruct"),
                messages=[{"role": "user", "content":
                    "You are an ML tuning assistant. These are the top trials from a "
                    "DistilBERT hyperparameter search:\n" + summary +
                    "\nSuggest how to adjust the search space in 3 short sentences."}],
                max_tokens=200,
            )
            return {"source": "llm", "suggestion": out.choices[0].message.content}
        except Exception:
            pass  # fall back to the rule below
    return {"source": "rule", "suggestion": rule}