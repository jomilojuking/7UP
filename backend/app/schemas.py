from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class ModelImport(BaseModel):
    hub_id: str  # e.g. "distilbert-base-uncased"


class ModelInfo(BaseModel):
    id: int
    hub_id: str
    status: str


# ---------- datasets ----------
class DatasetSpec(BaseModel):
    """Which data to train/evaluate on.

    Either a Hugging Face dataset (hub_id + optional config) or a CSV uploaded
    through POST /datasets/upload (upload_id). The default is SST-2.
    """

    hub_id: Optional[str] = "stanfordnlp/sst2"
    config: Optional[str] = None
    upload_id: Optional[int] = None
    text_column: str = "sentence"
    label_column: str = "label"
    train_split: str = "train"
    # None (or a split without labels) -> hold out 10% of the training split.
    eval_split: Optional[str] = "validation"

    @model_validator(mode="after")
    def _one_source(self):
        if self.upload_id is not None:
            self.hub_id = None
        if not self.hub_id and self.upload_id is None:
            raise ValueError("Give either hub_id or upload_id.")
        if self.text_column == self.label_column:
            raise ValueError("text_column and label_column must be different.")
        return self

    def label(self) -> str:
        return f"upload #{self.upload_id}" if self.upload_id is not None else (
            self.hub_id + (f" ({self.config})" if self.config else ""))


def _coerce_dataset(v):
    # Backward compatible with the old API, which took dataset="sst2".
    if v is None or v == "sst2":
        return DatasetSpec()
    if isinstance(v, str):
        raise ValueError('Pass "sst2" or a dataset object, e.g. '
                         '{"hub_id": "imdb", "text_column": "text", "label_column": "label"}')
    return v


class DatasetInspect(BaseModel):
    hub_id: str
    config: Optional[str] = None


# ---------- fine-tuning ----------
class FinetuneRequest(BaseModel):
    model_id: int
    dataset: DatasetSpec = Field(default_factory=DatasetSpec)
    learning_rate: float = Field(2e-5, gt=0, le=1e-2)
    batch_size: int = Field(16, ge=1, le=128)
    epochs: int = Field(3, ge=1, le=10)
    weight_decay: float = Field(0.01, ge=0, le=0.5)
    warmup_ratio: float = Field(0.1, ge=0, le=0.5)
    # None -> push automatically when HF_TOKEN is configured on the server.
    push_to_hub: Optional[bool] = None
    hub_repo: Optional[str] = None  # e.g. "your-user/my-model"; defaults to HF_REPO

    _ds = field_validator("dataset", mode="before")(_coerce_dataset)


class FinetuneJob(BaseModel):
    id: int
    status: str  # queued, running, done, failed
    runner: Optional[str] = None  # "worker" or "in-process"
    hub_id: Optional[str] = None
    dataset: Optional[str] = None
    params: Optional[dict] = None
    accuracy: Optional[float] = None
    metrics: Optional[dict[str, float]] = None
    model_dir: Optional[str] = None
    mlflow_run_id: Optional[str] = None
    hub_url: Optional[str] = None
    hub_repo: Optional[str] = None
    hub_revision: Optional[str] = None
    hub_error: Optional[str] = None
    error: Optional[str] = None


# ---------- tuning ----------
class SearchSpace(BaseModel):
    lr_min: float = Field(1e-5, gt=0)
    lr_max: float = Field(1e-4, gt=0)
    batch_sizes: list[int] = Field(default_factory=lambda: [16, 32])
    wd_min: float = Field(0.0, ge=0)
    wd_max: float = Field(0.1, ge=0)
    epochs: int = Field(3, ge=1, le=10)

    @model_validator(mode="after")
    def _check(self):
        if self.lr_min >= self.lr_max:
            raise ValueError("lr_min must be smaller than lr_max.")
        if self.wd_min > self.wd_max:
            raise ValueError("wd_min must not be larger than wd_max.")
        self.batch_sizes = sorted({b for b in self.batch_sizes if 1 <= b <= 128}) or [16]
        return self


class StudyRequest(BaseModel):
    model_id: int
    n_trials: int = Field(10, ge=1, le=50)
    dataset: DatasetSpec = Field(default_factory=DatasetSpec)
    search_space: SearchSpace = Field(default_factory=SearchSpace)

    _ds = field_validator("dataset", mode="before")(_coerce_dataset)


class Trial(BaseModel):
    number: int
    state: str
    learning_rate: float
    batch_size: int
    weight_decay: float
    accuracy: Optional[float] = None


# ---------- A/B tests ----------
class ABTestRequest(BaseModel):
    job_a: int
    job_b: int


class ABTestResult(BaseModel):
    id: int
    status: str
    accuracy_a: Optional[float] = None
    accuracy_b: Optional[float] = None
    z_score: Optional[float] = None
    p_value: Optional[float] = None
    verdict: Optional[str] = None


# ---------- LLM insights ----------
class SuggestRequest(BaseModel):
    study_id: int
