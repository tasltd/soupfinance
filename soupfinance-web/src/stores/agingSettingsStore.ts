/**
 * Added (SOUPFIN-105): the aging-period settings, remembered in the browser.
 *
 * "Days per period" and "Number of periods" apply to every aging report, so a
 * user who switches to 15-day periods sees them on Summary and Detail, for A/R
 * and A/P, and still sees them next visit. Like favourites, this is a personal
 * view preference, not tenant data.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_BUCKET_CONFIG,
  normaliseBucketConfig,
  type AgingBucketConfig,
} from '../features/reports/aging/agingEngine';

interface AgingSettingsState {
  bucketConfig: AgingBucketConfig;
  setBucketConfig: (config: AgingBucketConfig) => void;
  reset: () => void;
}

export const useAgingSettingsStore = create<AgingSettingsState>()(
  persist(
    (set) => ({
      bucketConfig: DEFAULT_BUCKET_CONFIG,
      setBucketConfig: (config) => set({ bucketConfig: normaliseBucketConfig(config) }),
      reset: () => set({ bucketConfig: DEFAULT_BUCKET_CONFIG }),
    }),
    {
      name: 'aging-settings',
      // A hand-edited or older stored value must not break the report.
      merge: (persisted, current) => ({
        ...current,
        bucketConfig: normaliseBucketConfig(
          (persisted as Partial<AgingSettingsState> | undefined)?.bucketConfig ?? DEFAULT_BUCKET_CONFIG
        ),
      }),
    }
  )
);
