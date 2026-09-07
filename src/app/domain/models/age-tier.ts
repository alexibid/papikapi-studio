export type AgeTierId = 'tier-4-6' | 'tier-7-10' | 'tier-11-14' | 'tier-14-plus';

export interface AgeTier {
  readonly id: AgeTierId;
  readonly label: string;
  readonly ageRange: string;
  readonly subtitle: string;
  readonly icon: string;
  readonly technique: string;
  readonly pieceCountHint: string;
  readonly glueRequirement: string;
}
