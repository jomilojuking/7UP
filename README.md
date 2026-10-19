# Project Title: 7UP

>>> HFAIO automates the model lifecycle for Machine Learning Engineers: it fine-tunes Hugging Face Transformer models, searches hyperparameters automatically with Optuna, tracks every experiment, and deploys and monitors models through a Kubernetes pipeline. [Add the specific problem and model once chosen.]

## Team Members & Contributions
As per course requirements, all three members must actively collaborate and commit to this repository.
*   **Jomiloju King (jomilojuking)** - Backend and ML core: FastAPI service, Hugging Face integration, Optuna and Accelerate tuning, MLflow logging, A/B testing
*   **Iyinoluwa Ayodele (grace502)** - Infrastructure and MLOps: Docker, Kubernetes and Helm, GitHub Actions CI/CD, Prometheus, Grafana, Slack alerts
*   **Pauline Ekoma (pekoma1)** - Frontend and experiment tracking: React and Tailwind dashboard, Plotly.js tuning charts, experiment tracker, monitoring views

---

## Live Demo
*   **Application URL:** [Insert link to live app, e.g., Hugging Face Spaces]
*   *Note: This live demo must be fully functional and accessible during the live project presentation.*

### Project Walkthrough
![Project Demo Walkthrough](demo.gif)

---

## Installation & Setup

Follow these steps to set up the environment and run the project locally.

### Prerequisites
*   Python 3.8+
*   `pip` or `conda`
*   Git
*   Node.js 18+ (frontend)
*   Docker and Docker Compose (full stack)

### Local Installation
```bash
# Clone the repository
git clone https://github.com/jomilojuking/HFAIO.git
cd HFAIO

# Backend
cd backend
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev

# Or run the whole stack (backend, frontend, Postgres, Redis, MLflow, Prometheus, Grafana)
cp .env.example .env    # then set the passwords and SLACK_WEBHOOK_URL
docker compose up --build
```

Copy `.env.example` to `.env` and fill in your own values. Never commit secrets.
Kubernetes (kind + Helm), CI/CD, monitoring and the runbook: see [docs/infra.md](docs/infra.md).

---

## Dataset
*   **Source:** [Link to dataset]
*   **Description:** [Features, target variable, and size.]
*   **Data Pipeline:** [How to download or access the data if it is not tracked in git.]

---

## Model Architecture & Training
*   **Algorithm:** [e.g., model name]
*   **Frameworks Used:** Hugging Face Transformers, Accelerate, Optuna, FastAPI, React, MLflow [edit to match what you actually use]
*   **Training Process:** [Epochs, loss function, optimizer, number of Optuna trials.]

### System Overview
*   **Backend (`/backend`):** FastAPI endpoints for importing models, fine-tuning, tuning studies, and A/B tests.
*   **Frontend (`/frontend`):** React and Tailwind dashboard with Plotly.js charts for tuning progress and experiments.
*   **Infrastructure (`/infra`, `/.github`):** Dockerfiles, Docker Compose, Helm chart deployed to kind, GitHub Actions CI/CD with automatic rollback, Prometheus alerts, Grafana dashboard, Slack alerts. Details in [docs/infra.md](docs/infra.md).

---

## Evaluation & Results
Summary of model performance on the test metrics.

| Metric | Training Set | Test Set |
| :--- | :--- | :--- |
| Accuracy / R² | 0.XX | 0.XX |
| Precision / F1-Score | 0.XX | 0.XX |
| Loss | 0.XX | 0.XX |

*Include any relevant confusion matrices, ROC curves, or training logs in an `assets/` directory and link them here.*

---

## Git Workflow & Guidelines
To maintain collaboration integrity, remember to:
1.  **Branch Frequently:** Create feature branches (`git checkout -b feature/your-feature`).
2.  **Commit Regularly:** Write descriptive commit messages (`git commit -m "Add /health endpoint"`).
3.  **Pull Before Push:** Always pull latest changes to avoid conflicts (`git pull origin main`).
4.  **Merge via Pull Request:** Every change is reviewed by a teammate before it is merged into `main`.
