import { useCallback, useState } from "react";
import { request } from "../api";
import type { DatasetSpec, Profile } from "../types";

/** Loads the dataset profile (class balance, lengths, words, examples) on demand. */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (spec: DatasetSpec) => {
    setLoading(true);
    setError("");
    try {
      const p: Profile = await request("/datasets/profile", {
        method: "POST",
        body: JSON.stringify(spec),
      });
      setProfile(p);
    } catch (e: any) {
      setProfile(null);
      setError(e.message);
    }
    setLoading(false);
  }, []);

  const clear = useCallback(() => {
    setProfile(null);
    setError("");
  }, []);

  return { profile, loading, error, load, clear };
}
