#!/usr/bin/env bash
# Protect `main`: PRs required, 1 approving review (CODEOWNERS), CI must pass,
# no force pushes. Needs a repo admin: `gh auth login` first.
#   infra/scripts/protect-main.sh jomilojuking/7UP
set -euo pipefail
REPO="${1:?usage: protect-main.sh owner/repo}"

gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Secret scan (gitleaks)",
      "Backend (lint, audit, test)",
      "Frontend (lint, type check, build, audit)",
      "Infra config (Helm, Compose, Prometheus)"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
echo "main is protected on $REPO"
