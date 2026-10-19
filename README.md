# Project Title: 7UP

# HFAIO (7UP)

HFAIO automates the model lifecycle for Machine Learning Engineers: it fine-tunes Hugging Face Transformer models, searches hyperparameters automatically with Optuna, tracks every experiment, and deploys and monitors models through a Kubernetes pipeline.

**Problem:** binary sentiment classification (positive vs. negative) on the SST-2 movie-review dataset. Any Hugging Face sequence-classification model can be imported by its Hub ID, fine-tuned, tuned, and compared on the same evaluation set.

**Model:** [Add the model(s) you demo, e.g. the Hub ID(s) shown in the Model Hub page.]

## Team Members & Contributions
As per course requirements, all three members actively collaborate and commit to this repository.
*   **Jomiloju King (jomilojuking)** - Backend and ML core: FastAPI service, Hugging Face integration, Optuna and Accelerate tuning, MLflow logging, A/B testing
*   **Iyinoluwa Ayodele (grace502)** - Infrastructure and MLOps: Docker, Kubernetes and Helm, GitHub Actions CI/CD, Prometheus, Grafana, Slack alerts
*   **Pauline Ekoma (pekoma1)** - Frontend and experiment tracking: React and Tailwind dashboard, Plotly.js tuning charts, experiment tracker, monitoring views

---

## Live Demo
*   **Application URL:** [Insert link to live app]
*   *Note: the live demo must be fully functional and accessible during the project presentation.*

### Project Walkthrough
![Project Demo Walkthrough](demo.gif)

---

## Installation & Setup

### Prerequisites
*   Python 3.11 recommended (the project's compiled files were generated with 3.11)
*   `pip` or `conda`
*   Git
*   Node.js 18+ (frontend)
*   Docker and Docker Compose (full stack only)

### Local Installation
```bash
# Clone the repository
git clone https://github.com/jomilojuking/HFAIO.git
cd HFAIO

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

The frontend calls `http://127.0.0.1:8000` by default. To point it at a different backend (for example a Cloudflare tunnel), create `frontend/.env.local` containing `VITE_API_URL=<backend url>` and restart `npm run dev`. Delete that file to go back to the local backend.

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
*   **Description:** Movie-review sentences labeled positive or negative (2 classes). [Add split sizes after checking them, see below.]
*   **Data Pipeline:** Nothing to download manually. The backend loads it at training time with `load_dataset("stanfordnlp/sst2")` from the Hugging Face `datasets` library, and it is cached locally after the first run. The API currently accepts only `sst2`.

To confirm split sizes for this section:
```bash
python -c "from datasets import load_dataset; print(load_dataset('stanfordnlp/sst2'))"
```

---

## Model Architecture & Training
*   **Algorithm:** Hugging Face `AutoModelForSequenceClassification` with a 2-label classification head, loaded from any Hub ID and fine-tuned with the Hugging Face `Trainer`.
*   **Frameworks Used:** Hugging Face Transformers, Datasets, Accelerate, Optuna, FastAPI, React, Tailwind, Plotly.js, MLflow
*   **Training Process:** [Epochs, learning rate, optimizer, batch size, and number of Optuna trials used in your demo run.]
*   **Evaluation:** Every saved model can be reloaded and scored on the same shared evaluation set, so different models are compared fairly. Fine-tuned models are saved under `backend/models`.

### System Overview
*   **Backend (`/backend`):** FastAPI endpoints for importing models, fine-tuning, tuning studies, and A/B tests. Experiments are logged to MLflow, and Optuna studies are stored in `optuna.db`.
*   **Frontend (`/frontend`):** React and Tailwind dashboard with Plotly.js charts for tuning progress and experiments (pages include Model Hub and Tuning Studio).
*   **Infrastructure (`/infra`, `/.github`):** Dockerfiles, Docker Compose, Helm chart deployed to kind, GitHub Actions CI/CD with automatic rollback, Prometheus alerts, Grafana dashboard, Slack alerts. Details in [docs/infra.md](docs/infra.md).

---

## Evaluation & Results
Summary of model performance on the training and test metrics.

| Metric | Training Set | Test Set |
| :--- | :--- | :--- |
| Accuracy | [0.XX] | [0.XX] |
| Precision / F1-Score | [0.XX] | [0.XX] |
| Loss | [0.XX] | [0.XX] |

*Include any relevant confusion matrices, training logs, or Optuna plots in an `assets/` directory and link them here.*

---

## Git Workflow & Guidelines
1.  **Branch Frequently:** Create feature branches (`git checkout -b feature/your-feature`).
2.  **Commit Regularly:** Write descriptive commit messages (`git commit -m "Add /health endpoint"`).
3.  **Pull Before Push:** Always pull latest changes to avoid conflicts (`git pull origin main`).
4.  **Merge via Pull Request:** Every change is reviewed by a teammate before it is merged into `main`.ges to avoid conflicts (`git pull origin main`).
4.  **Merge via Pull Request:** Every change is reviewed by a teammate before it is merged into `main`.
