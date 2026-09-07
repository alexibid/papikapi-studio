import { AgeTierId } from './age-tier';
import { PaperFigure } from './paper-figure';

export type ReviewVerdict = 'strong' | 'weak' | 'broken';

export interface LabReview {
  readonly verdict: ReviewVerdict;
  readonly notes: string;
}

export interface LabAttempt {
  readonly id: string;
  readonly theme: string;
  readonly model: string;
  readonly plateCount: number;
  readonly errors: readonly string[];
  readonly figure?: PaperFigure;
  readonly review?: LabReview;
}

export interface LabRun {
  readonly id: string;
  readonly ranAt: string;
  readonly tierId: AgeTierId;
  readonly title: string;
  readonly summary?: string;
  readonly attempts: readonly LabAttempt[];
}
