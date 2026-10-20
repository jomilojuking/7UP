# HFAIO (7UP)

HFAIO automates the model lifecycle for Machine Learning Engineers: it fine-tunes Hugging Face Transformer models, searches hyperparameters automatically with Optuna, tracks every experiment, and deploys and monitors models through a Kubernetes pipeline.

**Problem:** binary sentiment classification (positive vs. negative) on the SST-2 movie-review dataset. Any Hugging Face sequence-classification model can be imported by its Hub ID, fine-tuned, tuned, and compared on the same evaluation set.

**Model:** `distilbert-base-uncased`, a small, fast pretrained English model from Hugging Face, fine-tuned with a 2-class classification head.

## Team Members & Contributions
As per course requirements, all three members actively collaborate and commit to this repository.
*   **Jomiloju King (jomilojuking)** - Backend and ML core: FastAPI service, Hugging Face integration, Optuna tuning (on the Hugging Face Trainer, which uses Accelerate), MLflow logging, A/B testing
*   **Iyinoluwa Ayodele (grace502)** - Infrastructure and MLOps: Docker, Kubernetes and Helm, GitHub Actions CI/CD, Prometheus, Grafana, Slack alerts
*   **Pauline Ekoma (pekoma1)** - Frontend and experiment tracking: React and Tailwind dashboard, Plotly.js tuning charts, experiment tracker, monitoring views

---

## Live Demo
*   **Application URL:** [https://hfaio.vercel.app](https://hfaio.vercel.app/)
*   **Hosting:** the React frontend is on Vercel, and the FastAPI backend runs in a Docker Space on Hugging Face (free CPU).
*   **Note:** the hosted backend uses a shortened training setup (fewer sentences and fewer epochs) because the free server has only 2 CPU cores, so scores there are lower than the results below. Imported models, runs, and tuning studies live in the backend's memory, so they reset whenever the Space restarts.

### Project Walkthrough
<img width="960" alt="7UP walkthrough" src="https://github.com/user-attachments/assets/d83f355b-4f62-4222-9bc1-16fbc5ca3929" />

---

## Installation & Setup

### Prerequisites
*   Python 3.11
*   `pip` or `conda`
*   Git
*   Node.js 18+ (frontend)
*   Docker and Docker Compose (full stack only)

### Local Installation
```bash
# Clone the repository
git clone https://github.com/jomilojuking/7UP.git
cd 7UP

# Terminal 1: backend (http://127.0.0.1:8000, API docs at /docs)
cd backend
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Terminal 2: frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

### Deployment

The app is deployed in two parts:

*   **Backend:** the FastAPI service runs in a Docker Space on Hugging Face ([jomilojuking/hfaio-backend](https://huggingface.co/spaces/jomilojuking/hfaio-backend)), on the free CPU tier (2 cores). The Space uses its own `Dockerfile`, which installs the CPU build of PyTorch and the packages from `requirements.txt` and serves the API on port 7860. Saved models and database files are not included in the Space.
*   **Frontend:** the React app is built with `VITE_API_URL` set to the Space's address and hosted on Vercel at [hfaio.vercel.app](https://hfaio.vercel.app/).

Because the free server is small, the Space uses a shortened training setup, set as environment variables in its `Dockerfile`: `MAX_TRAIN=500`, `MAX_EVAL=200`, and `TUNE_EPOCHS=1` (one epoch per tuning trial). Scores on the hosted site are therefore lower than the results below, which came from a local run. The Space's disk is not persistent, so imported models, runs, and tuning studies reset whenever it restarts.

To run the frontend against a different backend, create `frontend/.env.local` containing `VITE_API_URL=<backend url>` and restart `npm run dev`. By default it calls `http://127.0.0.1:8000`. Delete that file to go back to the local backend.
### Full stack with Docker
Runs the backend, frontend, Postgres, Redis, MLflow, Prometheus and Grafana together:
```bash
cp .env.example .env    # then set the passwords and SLACK_WEBHOOK_URL
docker compose up --build
```

Copy `.env.example` to `.env` and fill in your own values. Never commit secrets.
Kubernetes (kind + Helm), CI/CD, monitoring and the runbook: see [docs/infra.md](docs/infra.md).

---

## Dataset
*   **Source:** [SST-2 (Stanford Sentiment Treebank, binary)](https://huggingface.co/datasets/stanfordnlp/sst2), part of the GLUE benchmark
*   **Description:** movie-review sentences labeled positive (1) or negative (0). The project trains on a random subset of the training split and evaluates on a random sample of the validation split, because the official test labels are hidden. Subset sizes are set by the `MAX_TRAIN` and `MAX_EVAL` environment variables (defaults: 2,000 and 500).
*   **Data Pipeline:** nothing to download manually. The backend loads it at training time with `load_dataset("stanfordnlp/sst2")` from the Hugging Face `datasets` library, and it is cached locally after the first run. The API currently accepts only `sst2`.

To see the full split sizes:
```bash
python -c "from datasets import load_dataset; print(load_dataset('stanfordnlp/sst2'))"
```

---

## Model Architecture & Training
*   **Algorithm:** Hugging Face `AutoModelForSequenceClassification` with a 2-label classification head, loaded from any Hub ID and fine-tuned with the Hugging Face `Trainer`.
*   **Frameworks Used:** Hugging Face Transformers, Datasets, Accelerate, PyTorch, Optuna, FastAPI, React, Tailwind, Plotly.js, MLflow
*   **Training Process (Experiments run):** learning rate 2e-5, batch size 16, 1 epoch, the Trainer's default optimizer (AdamW), maximum sequence length 128, evaluated at the end of each epoch.
*   **Hyperparameter Tuning (Optuna):** maximizes accuracy. The search space is learning rate 1e-5 to 1e-4 (log scale), batch size 16 or 32, and weight decay 0 to 0.1. Each trial trains for 3 epochs, and a median pruner stops weak trials early (pruning starts after the first 2 trials). The demo study used 3 trials.
*   **Evaluation:** every saved model can be reloaded and scored on the same shared evaluation set, so different models are compared fairly. Fine-tuned models are saved under `backend/models`.

### System Overview
*   **Backend (`/backend`):** FastAPI endpoints for importing models, fine-tuning, tuning studies, and A/B tests. Experiments are logged to MLflow, and Optuna studies are stored in `optuna.db`. A `/health` endpoint and Prometheus `/metrics` feed monitoring.
*   **Frontend (`/frontend`):** React and Tailwind dashboard with four pages (Model Hub, Tuning Studio, Experiments, Monitoring) and Plotly.js charts for tuning progress and experiments.
*   **Infrastructure (`/infra`, `/.github`):** Dockerfiles, Docker Compose, Helm chart deployed to kind with health checks and automated rollback, GitHub Actions CI/CD with Trivy security scanning, Prometheus, Grafana, and Alertmanager with Slack alerts. Details in [docs/infra.md](docs/infra.md).

---

## 📈 Evaluation & Results
Performance of the fine-tuned `distilbert-base-uncased` on SST-2 binary sentiment classification (learning rate 2e-5, batch size 16, 1 epoch). The training set is a random 2,000-sentence subset of the SST-2 training split. The test set is a random 500-sentence sample of the SST-2 validation split (the official test labels are hidden).

| Metric | Training Set | Test Set |
| :--- | :--- | :--- |
| Accuracy | 0.888 | 0.816 |
| Precision / F1-Score | 0.922 / 0.897 | 0.851 / 0.817 |
| Recall | 0.874 | 0.785 |
| Loss | 0.308 | 0.389 |

All runs are logged to MLflow, and the Experiments page shows the same metrics for every run.

![Experiments page with train and test metrics](assets/experiments-metrics.png)

---
