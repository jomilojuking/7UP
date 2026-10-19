-- Runs once, on the first start of an empty Postgres volume.
-- The app database (POSTGRES_DB, default "hfaio") is created by the image itself;
-- MLflow gets its own database so its migrations never touch app tables.
CREATE DATABASE mlflow;
