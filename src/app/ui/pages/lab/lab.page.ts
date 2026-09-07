import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LabRunsService } from '../../../application/services/lab-runs.service';
import { TYRANNOSAURUS } from '../../../domain/data/figures/tyrannosaurus';
import { LabAttempt, LabRun, ReviewVerdict } from '../../../domain/models/lab-run';
import { FigureSheetComponent } from '../../components/figure-sheet/figure-sheet';
import { ModelViewer3DComponent } from '../../components/model-viewer-3d/model-viewer-3d';

const VERDICT_LABELS: Readonly<Record<ReviewVerdict, string>> = {
  strong: 'Recognisable',
  weak: 'Weak',
  broken: 'Broken',
};

@Component({
  selector: 'kirigami-lab-page',
  standalone: true,
  imports: [RouterLink, FigureSheetComponent, ModelViewer3DComponent],
  templateUrl: './lab.page.html',
  styleUrl: './lab.page.scss',
})
export class LabPage implements OnInit {
  protected readonly lab = inject(LabRunsService);

  protected readonly exemplar = TYRANNOSAURUS;
  protected readonly exemplarTab = signal<'3d' | 'sheet'>('3d');

  ngOnInit(): void {
    void this.lab.load();
  }

  protected foldsCleanly(attempt: LabAttempt): boolean {
    return attempt.errors.length === 0 && attempt.plateCount > 0;
  }

  protected verdictLabel(attempt: LabAttempt): string {
    const verdict = attempt.review?.verdict;
    return verdict ? VERDICT_LABELS[verdict] : 'Unreviewed';
  }

  protected verdictModifier(attempt: LabAttempt): string {
    return attempt.review?.verdict ?? 'pending';
  }

  protected recognisableCount(run: LabRun): number {
    return run.attempts.filter((attempt) => attempt.review?.verdict === 'strong').length;
  }

  protected foldableCount(run: LabRun): number {
    return run.attempts.filter((attempt) => this.foldsCleanly(attempt)).length;
  }
}
