# MLflow tracking server with the PostgreSQL driver (the upstream image ships
# without a Postgres driver, so it cannot use Postgres as its backend store).
FROM ghcr.io/mlflow/mlflow:v3.17.1

RUN pip install --no-cache-dir "psycopg[binary]==3.2.10"

RUN useradd --uid 10002 --create-home mlflow \
 && mkdir -p /mlartifacts \
 && chown mlflow /mlartifacts
USER 10002

EXPOSE 5000
