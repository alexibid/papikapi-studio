import { AgeTierId } from '../models/age-tier';

export interface TierRules {
  readonly tierId: AgeTierId;
  readonly scissors: number;
  readonly maxPlates: number;
  readonly maxOutlinePoints: number;
  readonly minFeatureMm: number;
  readonly guidance: string;
}

export const TIER_RULES: Readonly<Record<AgeTierId, TierRules>> = {
  'tier-4-6': {
    tierId: 'tier-4-6',
    scissors: 1,
    maxPlates: 4,
    maxOutlinePoints: 10,
    minFeatureMm: 15,
    guidance: 'Two flanks and at most two appendages. Straight cuts only, no narrow spikes.',
  },
  'tier-7-10': {
    tierId: 'tier-7-10',
    scissors: 2,
    maxPlates: 8,
    maxOutlinePoints: 18,
    minFeatureMm: 10,
    guidance: 'Two flanks plus up to four fold-out appendages such as legs, wings or fins.',
  },
  'tier-11-14': {
    tierId: 'tier-11-14',
    scissors: 3,
    maxPlates: 14,
    maxOutlinePoints: 26,
    minFeatureMm: 7,
    guidance: 'Richer profile with segmented appendages and finer contour detail.',
  },
  'tier-14-plus': {
    tierId: 'tier-14-plus',
    scissors: 4,
    maxPlates: 22,
    maxOutlinePoints: 34,
    minFeatureMm: 5,
    guidance: 'Intricate silhouette with many appendages and sculpted contours.',
  },
};
