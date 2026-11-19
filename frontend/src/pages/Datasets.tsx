import { useEffect, useState } from "react";
import DatasetPicker from "../components/DatasetPicker";
import DatasetProfile from "../components/DatasetProfile";
import { Button, Notice, PageHeader, Panel } from "../components/ui";
import { useProfile } from "../components/useProfile";
import { isComplete, loadDataset, type DatasetSpec } from "../types";

function Skeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dataset profile">
      <div className="h-[92px] animate-pulse rounded-2xl bg-surface/70" />
      <div className="h-[220px] animate-pulse rounded-2xl bg-surface/70" />
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="h-[320px] animate-pulse rounded-2xl bg-surface/70" />
        <div className="h-[320px] animate-pulse rounded-2xl bg-surface/70" />
      </div>
    </div>
  );
}

export default function Datasets() {
  const [spec, setSpec] = useState<DatasetSpec>(loadDataset);
  const prof = useProfile();
  const { load } = prof;

  // Profile whatever dataset was last chosen as soon as the page opens.
  useEffect(() => {
    const s = loadDataset();
    if (isComplete(s)) load(s);
  }, [load]);

  return (
    <div className="space-y-8">
      <PageHeader title="Datasets">
        Look at the data before you train on it: how the labels are split, how long the texts
        are, and which words carry each class.
      </PageHeader>

      <Panel title="Data source"
        description="Your choice here is also used on the Experiments and Tuning Studio pages."
        actions={
          <Button disabled={!isComplete(spec) || prof.loading} onClick={() => prof.load(spec)}>
            {prof.loading ? "Profiling…" : "Profile dataset"}
          </Button>
        }>
        <DatasetPicker value={spec} onChange={setSpec} preview={false} />
      </Panel>

      {prof.error && <Notice>{prof.error}</Notice>}
      {prof.loading && !prof.profile && <Skeleton />}
      {prof.profile && (
        <div className={prof.loading ? "opacity-60 transition-opacity" : ""}>
          <h2 className="display mb-5 text-[30px] text-ink">
            {prof.profile.dataset}
          </h2>
          <DatasetProfile p={prof.profile} />
        </div>
      )}
    </div>
  );
}
