from pydantic import BaseModel
from typing import Optional


class ModelImport(BaseModel):
    hub_id: str  # e.g. "distilbert-base-uncased"


class ModelInfo(BaseModel):
    id: int
    hub_id: str
    status: str


class FinetuneRequest(BaseModel):
    model_id: int
    dataset: str = "sst2"
    learning_rate: float = 2e-5
    batch_size: int = 16
    epochs: int = 2
    push_to_hub: bool = False


class FinetuneJob(BaseModel):
    id: int
    status: str  # queued, running, done, failed
    accuracy: Optional[float] = None
    metrics: Optional[dict[str, float]] = None
    model_dir: Optional[str] = None
    hub_url: Optional[str] = None
    error: Optional[str] = None


class StudyRequest(BaseModel):
    model_id: int
    n_trials: int = 10


class Trial(BaseModel):
    number: int
    state: str
    learning_rate: float
    batch_size: int
    weight_decay: float
    accuracy: Optional[float] = None


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


class SuggestRequest(BaseModel):
    study_id: int