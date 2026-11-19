export type DatasetSpec = {
  hub_id?: string | null;
  config?: string | null;
  upload_id?: number | null;
  text_column: string;
  label_column: string;
  train_split?: string;
  eval_split?: string | null;
};

export const SST2: DatasetSpec = {
  hub_id: "stanfordnlp/sst2",
  text_column: "sentence",
  label_column: "label",
  train_split: "train",
  eval_split: "validation",
};

export type SearchSpace = {
  lr_min: number;
  lr_max: number;
  batch_sizes: number[];
  wd_min: number;
  wd_max: number;
  epochs: number;
};

export const DEFAULT_SPACE: SearchSpace = {
  lr_min: 1e-5,
  lr_max: 1e-4,
  batch_sizes: [16, 32],
  wd_min: 0,
  wd_max: 0.1,
  epochs: 3,
};

export type LlmAnswer = {
  model: string;
  ok: boolean;
  error?: string;
  summary?: string;
  recommendations?: string[];
  search_space?: SearchSpace | null;
};

export type Insights = {
  source: "llm" | "rule";
  suggestion: string;
  recommended_search_space: SearchSpace;
  llm: LlmAnswer[];
  rule_based: { summary: string; recommendations: string[]; search_space: SearchSpace };
  context: string;
};

// Experiments page -> Tuning Studio hand-off for "Use these ranges".
export const SPACE_KEY = "hfaio.nextSearchSpace";

export type Profile = {
  dataset: string;
  label_names: string[];
  eval_source: string;
  train: { rows: number; counts: number[] };
  eval: { rows: number; counts: number[] };
  length: {
    edges: number[];
    counts: number[];
    mean: number;
    median: number;
    p95: number;
    max: number;
    mean_by_label: number[];
  };
  top_words: { word: string; count: number }[][];
  examples: string[][];
  sampled: { train_limit: number; eval_limit: number };
};

// The dataset chosen on any page is remembered, so Datasets, Experiments and
// Tuning Studio all start from the same data.
const DATASET_KEY = "hfaio.dataset";

export function loadDataset(): DatasetSpec {
  try {
    const raw = localStorage.getItem(DATASET_KEY);
    if (raw) return { ...SST2, ...JSON.parse(raw) };
  } catch {
    // storage unavailable
  }
  return SST2;
}

export function saveDataset(spec: DatasetSpec) {
  try {
    localStorage.setItem(DATASET_KEY, JSON.stringify(spec));
  } catch {
    // storage unavailable
  }
}

export const isComplete = (s: DatasetSpec) =>
  !!(s.text_column && s.label_column && (s.upload_id != null || s.hub_id));
