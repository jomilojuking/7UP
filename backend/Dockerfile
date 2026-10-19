# syntax=docker/dockerfile:1
# Multi-stage build for the HFAIO backend (FastAPI + Transformers + Optuna).
# Stage 1 installs dependencies into a virtualenv; stage 2 copies only the
# virtualenv and the app code into a slim image that runs as a non-root user.

ARG PYTHON_IMAGE=python:3.11-slim

# ---------- builder ----------
FROM ${PYTHON_IMAGE} AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
# Keep packaging tools current (old wheel/setuptools carry HIGH CVEs).
RUN pip install --upgrade pip setuptools wheel

COPY requirements.txt .
# Install the CPU-only torch wheel first. The default PyPI wheel pulls in
# several GB of CUDA libraries the demo does not need. The pinned version in
# requirements.txt is then already satisfied (2.x.y+cpu matches ==2.x.y).
RUN TORCH_VERSION="$(grep -E '^torch==' requirements.txt | cut -d= -f3)" \
 && pip install --index-url https://download.pytorch.org/whl/cpu "torch==${TORCH_VERSION}" \
 && pip install -r requirements.txt

# Build tools are not needed at runtime; dropping them removes the old
# libraries they vendor (urllib3, msgpack, ...) that Trivy flags as HIGH.
RUN pip uninstall -y pip setuptools wheel

# ---------- runtime ----------
FROM ${PYTHON_IMAGE} AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH=/opt/venv/bin:$PATH \
    PYTHONPATH=/app \
    HF_HOME=/data/hf-cache

# The base image's own pip/setuptools/wheel (and the libraries they vendor)
# are not needed at runtime and carry HIGH CVEs, so remove them. The app uses
# the virtualenv, which has its own up-to-date copies.
RUN rm -rf /usr/local/lib/python3.11/site-packages/pip* \
           /usr/local/lib/python3.11/site-packages/setuptools* \
           /usr/local/lib/python3.11/site-packages/wheel* \
           /usr/local/lib/python3.11/site-packages/pkg_resources \
           /usr/local/lib/python3.11/site-packages/_distutils_hack \
           /usr/local/lib/python3.11/site-packages/distutils-precedence.pth \
           /usr/local/lib/python3.11/ensurepip/_bundled \
           /usr/local/bin/pip*

# Non-root user with a fixed UID so Kubernetes securityContext can match it.
RUN groupadd --gid 10001 hfaio \
 && useradd --uid 10001 --gid hfaio --create-home --shell /usr/sbin/nologin hfaio \
 && mkdir -p /data \
 && chown hfaio:hfaio /data

COPY --from=builder /opt/venv /opt/venv
COPY --chown=hfaio:hfaio app /app/app

# The backend writes optuna.db, mlflow.db and models/ relative to its working
# directory, so run from /data (a volume) instead of the read-only code dir.
WORKDIR /data
USER 10001

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=60s --retries=5 \
  CMD ["python", "-c", "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health', timeout=2)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
