# Screenshots used in the main README

Add these two images here (PNG, about 1400 px wide):

| File | What to capture |
| :--- | :--- |
| `grafana-dashboard.png` | Grafana at http://localhost:3001, the **HFAIO service health** dashboard, after starting a fine-tuning run so the request and latency panels have data. |
| `slack-alert.png` | The alert message in your Slack channel. To trigger one, stop the backend (`docker compose stop backend`) and wait for the `BackendDown` alert, then start it again to get the "resolved" message too. |
