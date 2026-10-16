import os
from huggingface_hub import HfApi


def push_folder(folder, repo_id, accuracy, base_model):
    """Upload a fine-tuned model with an auto-generated model card."""
    card = (
        f"---\nbase_model: {base_model}\n---\n"
        f"# Fine-tuned {base_model}\n\n"
        f"Trained with HFAIO on SST-2. Eval accuracy: {accuracy:.4f}\n"
    )
    with open(os.path.join(folder, "README.md"), "w") as f:
        f.write(card)
    api = HfApi(token=os.environ["HF_TOKEN"])
    api.create_repo(repo_id, exist_ok=True, private=True)
    api.upload_folder(folder_path=folder, repo_id=repo_id)
    return f"https://huggingface.co/{repo_id}"