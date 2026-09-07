import { AgeTier, AgeTierId } from '../models/age-tier';

export const TIER_DEFINITIONS: readonly AgeTier[] = [
  {
    id: 'tier-4-6',
    label: 'Voxel Cuties',
    ageRange: '4–6 years',
    subtitle: 'Minecraft Chibi style',
    icon: '🧸',
    technique: 'Wide straight cuts, 90° creases',
    pieceCountHint: '2 to 4 large plates',
    glueRequirement: 'Easy glue stick',
  },
  {
    id: 'tier-7-10',
    label: 'Cut & Slot',
    ageRange: '7–10 years',
    subtitle: 'Paper Pet & slots style',
    icon: '✂️',
    technique: 'Continuous body, numbered tabs and slots',
    pieceCountHint: '4 to 8 articulated plates',
    glueRequirement: 'Mechanical slots / minimal glue',
  },
  {
    id: 'tier-11-14',
    label: 'Polyhedral Builder',
    ageRange: '11–14 years',
    subtitle: 'Articulated low-poly 3D',
    icon: '📐',
    technique: 'Angled facets, movable jaws',
    pieceCountHint: '8 to 14 structured plates',
    glueRequirement: 'Precision locking slots',
  },
  {
    id: 'tier-14-plus',
    label: 'Sculpture Master',
    ageRange: '14+ years',
    subtitle: 'Advanced collector papercraft',
    icon: '👑',
    technique: 'High precision, multifaceted geometry',
    pieceCountHint: '14 to 22 detail plates',
    glueRequirement: 'Meticulous precision assembly',
  },
];

export function findTier(tierId: AgeTierId): AgeTier {
  const tier = TIER_DEFINITIONS.find((candidate) => candidate.id === tierId);
  if (!tier) {
    throw new Error(`Unknown age tier '${tierId}'.`);
  }
  return tier;
}
